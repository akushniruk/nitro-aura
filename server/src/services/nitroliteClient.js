/**
 * Nitrolite client and channel management for the server
 */
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { polygon } from 'viem/chains';
import { ethers } from 'ethers';
import WebSocket from 'ws';
import { NitroliteClient, NitroliteRPC, createAuthRequestMessage, createAuthVerifyMessage, createPingMessage } from '@erc7824/nitrolite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connection status
export const WSStatus = {
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  RECONNECT_FAILED: 'reconnect_failed',
  AUTH_FAILED: 'auth_failed',
  AUTHENTICATING: 'authenticating'
};

// Server-side WebSocket client with authentication
export class ServerWebSocketClient {
  constructor(url, privateKey) {
    this.url = url;
    this.privateKey = privateKey;
    this.ws = null;
    this.status = WSStatus.DISCONNECTED;
    this.channel = null;
    this.wallet = new ethers.Wallet(privateKey);
    this.address = this.wallet.address;
    this.pendingRequests = new Map();
    this.nextRequestId = 1;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.reconnectTimeout = null;
    this.onMessageCallbacks = [];
    this.onStatusChangeCallbacks = [];
    this.nitroliteClient = null;

    console.log(`Server wallet initialized with address: ${this.address}`);
  }

  // Register message callback
  onMessage(callback) {
    this.onMessageCallbacks.push(callback);
  }

  // Register status change callback
  onStatusChange(callback) {
    this.onStatusChangeCallbacks.push(callback);
  }

  // Connect to WebSocket server
  async connect() {
    if (this.status === WSStatus.CONNECTED || this.status === WSStatus.CONNECTING) {
      console.log('Already connected or connecting...');
      return;
    }

    try {
      console.log(`Connecting to ${this.url}...`);
      this.setStatus(WSStatus.CONNECTING);

      this.ws = new WebSocket(this.url);

      this.ws.on('open', async () => {
        console.log('WebSocket connection established');
        this.setStatus(WSStatus.AUTHENTICATING);
        try {
          await this.authenticate();
          console.log('Successfully authenticated with the WebSocket server');
          this.setStatus(WSStatus.CONNECTED);
          this.reconnectAttempts = 0;
          this.startPingInterval();
        } catch (error) {
          console.error('Authentication failed:', error);
          this.setStatus(WSStatus.AUTH_FAILED);
          this.ws.close();
        }
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.setStatus(WSStatus.DISCONNECTED);
        clearInterval(this.pingInterval);
        this.handleReconnect();
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      this.setStatus(WSStatus.DISCONNECTED);
      this.handleReconnect();
    }
  }

  // Update status and notify listeners
  setStatus(status) {
    const prevStatus = this.status;
    this.status = status;
    console.log(`WebSocket status changed: ${prevStatus} -> ${status}`);
    this.onStatusChangeCallbacks.forEach(callback => callback(status));
  }

  // Authenticate with WebSocket server
  async authenticate() {
    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }

    console.log('Starting authentication process...');

    // Helper function to sign messages
    const sign = async (message) => {
      console.log(`Signing message: ${typeof message === 'string' ? message.slice(0, 50) : JSON.stringify(message).slice(0, 50)}...`);
      
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      const digestHex = ethers.id(messageStr);
      const messageBytes = ethers.getBytes(digestHex);
      
      const { serialized: signature } = this.wallet.signingKey.sign(messageBytes);
      
      return signature;
    };

    return new Promise((resolve, reject) => {
      const authRequest = async () => {
        try {
          const request = await createAuthRequestMessage(sign, this.address);
          console.log('Sending auth request:', request.slice(0, 100) + '...');
          this.ws.send(request);
        } catch (error) {
          console.error('Error creating auth request:', error);
          reject(error);
        }
      };

      // Set up response handler
      const handleAuthResponse = async (data) => {
        try {
          console.log(`Received authentication response: ${data.slice(0, 100)}...`);
          
          const response = JSON.parse(data);

          if (response.res && response.res[1] === 'auth_challenge') {
            console.log('Received auth challenge, sending verification...');
            const authVerify = await createAuthVerifyMessage(sign, data, this.address);
            console.log(`Sending auth verification: ${authVerify.slice(0, 100)}...`);
            this.ws.send(authVerify);
          } else if (response.res && response.res[1] === 'auth_verify') {
            console.log('Authentication successful!');
            this.ws.removeListener('message', authMessageHandler);
            
            // Request channel information for our address
            await this.getChannelInfo();
            
            resolve();
          } else if (response.err) {
            console.error('Authentication error:', response.err);
            this.ws.removeListener('message', authMessageHandler);
            reject(new Error(response.err[2] || 'Authentication failed'));
          }
        } catch (error) {
          console.error('Error handling auth response:', error);
          this.ws.removeListener('message', authMessageHandler);
          reject(error);
        }
      };

      const authMessageHandler = (data) => {
        handleAuthResponse(data.toString());
      };

      this.ws.on('message', authMessageHandler);
      
      // Start authentication process
      authRequest();

      // Set timeout
      setTimeout(() => {
        this.ws.removeListener('message', authMessageHandler);
        reject(new Error('Authentication timeout'));
      }, 10000);
    });
  }

  // Handle incoming WebSocket messages
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log(`Received message: ${JSON.stringify(message, null, 2)}`);

      // Notify callbacks
      this.onMessageCallbacks.forEach(callback => callback(message));

      // Handle response to pending requests
      if (message.res && Array.isArray(message.res) && message.res.length >= 3) {
        const requestId = message.res[0];
        if (this.pendingRequests.has(requestId)) {
          const { resolve } = this.pendingRequests.get(requestId);
          resolve(message.res[2]);
          this.pendingRequests.delete(requestId);
        }
      }

      // Handle errors
      if (message.err && Array.isArray(message.err) && message.err.length >= 3) {
        const requestId = message.err[0];
        if (this.pendingRequests.has(requestId)) {
          const { reject } = this.pendingRequests.get(requestId);
          reject(new Error(`Error ${message.err[1]}: ${message.err[2]}`));
          this.pendingRequests.delete(requestId);
        }
      }

      // Handle channel-specific messages
      if (message.type === 'channel_created') {
        console.log('Channel created successfully:', message.channel);
        this.channel = message.channel;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  // Send a request to the WebSocket server
  async sendRequest(method, params = {}) {
    if (!this.ws || this.status !== WSStatus.CONNECTED) {
      throw new Error('WebSocket not connected');
    }

    const requestId = this.nextRequestId++;
    
    // Helper function to sign messages
    const sign = async (message) => {
      console.log(`Signing request message: ${typeof message === 'string' ? message.slice(0, 50) : JSON.stringify(message).slice(0, 50)}...`);
      
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      const digestHex = ethers.id(messageStr);
      const messageBytes = ethers.getBytes(digestHex);
      
      const { serialized: signature } = this.wallet.signingKey.sign(messageBytes);
      
      return signature;
    };

    return new Promise(async (resolve, reject) => {
      try {
        const request = NitroliteRPC.createRequest(requestId, method, params);
        const signedRequest = await NitroliteRPC.signRequestMessage(request, sign);
        
        console.log(`Sending request: ${JSON.stringify(signedRequest).slice(0, 100)}...`);
        
        this.pendingRequests.set(requestId, { resolve, reject });
        
        // Set timeout
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Request timeout'));
          }
        }, 10000);
        
        this.ws.send(typeof signedRequest === 'string' ? signedRequest : JSON.stringify(signedRequest));
      } catch (error) {
        console.error('Error sending request:', error);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  // Start ping interval to keep connection alive
  startPingInterval() {
    clearInterval(this.pingInterval);
    this.pingInterval = setInterval(async () => {
      if (this.status === WSStatus.CONNECTED) {
        try {
          // Helper function to sign messages
          const sign = async (message) => {
            const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
            const digestHex = ethers.id(messageStr);
            const messageBytes = ethers.getBytes(digestHex);
            
            const { serialized: signature } = this.wallet.signingKey.sign(messageBytes);
            
            return signature;
          };
          
          const pingMessage = await createPingMessage(sign);
          console.log('Sending ping...');
          this.ws.send(pingMessage);
        } catch (error) {
          console.error('Error sending ping:', error);
        }
      }
    }, 30000);
  }

  // Handle reconnection
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Maximum reconnect attempts reached');
      this.setStatus(WSStatus.RECONNECT_FAILED);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.setStatus(WSStatus.RECONNECTING);
    
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Close connection
  close() {
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimeout);
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    console.log('WebSocket connection closed manually');
    this.setStatus(WSStatus.DISCONNECTED);
  }

  // Get channel information
  async getChannelInfo() {
    try {
      console.log('Requesting channel information...');
      const channels = await this.sendRequest('get_channels', [{ participant: this.address }]);
      console.log('Channel info received:', channels);
      
      if (channels && channels.length > 0) {
        console.log(`Found ${channels.length} existing channels`);
        this.channel = channels[0];
      } else {
        console.log('No existing channels found');
      }
      
      return channels;
    } catch (error) {
      console.error('Error getting channel info:', error);
      throw error;
    }
  }

  // Initialize Nitrolite client for channel creation
  async initializeNitroliteClient() {
    try {
      console.log('Initializing Nitrolite client...');
      
      // Create client instances required by Nitrolite
      const publicClient = createPublicClient({
        transport: http(),
        chain: polygon,
      });

      // Create custom JSON-RPC provider
      const customProvider = {
        request: async ({ method, params }) => {
          console.log(`JSON-RPC call: ${method}`, params);
          // Implement minimal RPC functionality needed
          if (method === 'eth_chainId') {
            return '0x' + Number(process.env.CHAIN_ID).toString(16);
          }
          if (method === 'eth_accounts') {
            return [this.address];
          }
          throw new Error(`Unsupported method: ${method}`);
        }
      };
      
      // Create wallet client
      const walletClient = createWalletClient({
        transport: custom(customProvider),
        chain: polygon,
        account: this.address,
      });
      
      // Create state wallet client
      const stateWalletClient = {
        account: {
          address: this.address,
        },
        signMessage: async ({ message }) => {
          console.log(`Signing state wallet message: ${typeof message === 'object' ? JSON.stringify(message).slice(0, 50) : message.slice(0, 50)}...`);
          const messageToSign = typeof message === 'object' && message.raw ? message.raw : message;
          
          const messageStr = typeof messageToSign === 'string' ? messageToSign : JSON.stringify(messageToSign);
          const digestHex = ethers.id(messageStr);
          const messageBytes = ethers.getBytes(digestHex);
          
          const { serialized: signature } = this.wallet.signingKey.sign(messageBytes);
          
          return signature;
        },
      };
      
      // Contract addresses from environment variables
      const addresses = {
        custody: process.env.CUSTODY_ADDRESS,
        adjudicator: process.env.ADJUDICATOR_ADDRESS,
        guestAddress: process.env.DEFAULT_GUEST_ADDRESS,
        tokenAddress: process.env.USDC_TOKEN_ADDRESS,
      };
      
      // Initialize Nitrolite client
      this.nitroliteClient = new NitroliteClient({
        publicClient,
        walletClient,
        stateWalletClient,
        account: this.address,
        chainId: Number(process.env.CHAIN_ID),
        challengeDuration: BigInt(1), // Use the same value as the client
        addresses,
      });
      
      console.log('Nitrolite client initialized successfully');
      return this.nitroliteClient;
      
    } catch (error) {
      console.error('Error initializing Nitrolite client:', error);
      throw error;
    }
  }

  // Create a new channel with 0 USDC
  async createChannel() {
    try {
      if (!this.nitroliteClient) {
        await this.initializeNitroliteClient();
      }
      
      console.log('Creating new channel with 0 USDC...');
      
      const result = await this.nitroliteClient.createChannel({
        initialAllocationAmounts: [BigInt(0), BigInt(0)],
        stateData: '0x', // Empty state data
      });
      
      console.log('Channel created successfully:', result);
      
      // Store channel information
      this.channel = result.channel;
      
      return result;
    } catch (error) {
      console.error('Error creating channel:', error);
      throw error;
    }
  }
}

// Initialize and export the client instance
let wsClient = null;

export async function initializeClient() {
  if (wsClient) {
    return wsClient;
  }
  
  console.log('Initializing WebSocket client...');
  
  if (!process.env.SERVER_PRIVATE_KEY) {
    throw new Error('SERVER_PRIVATE_KEY environment variable is not set');
  }
  
  if (!process.env.WS_URL) {
    throw new Error('WS_URL environment variable is not set');
  }
  
  wsClient = new ServerWebSocketClient(
    process.env.WS_URL,
    process.env.SERVER_PRIVATE_KEY
  );
  
  // Log all WebSocket messages
  wsClient.onMessage((message) => {
    console.log('WS Message:', JSON.stringify(message, null, 2));
  });
  
  // Log status changes
  wsClient.onStatusChange((status) => {
    console.log('WebSocket status changed:', status);
  });
  
  // Connect to the WebSocket server
  await wsClient.connect();
  
  // Initialize Nitrolite client
  await wsClient.initializeNitroliteClient();
  
  // Get existing channels or create a new one
  const channels = await wsClient.getChannelInfo();
  
  if (!channels || channels.length === 0) {
    console.log('No channels found, creating a new channel...');
    await wsClient.createChannel();
  } else {
    console.log('Using existing channel:', channels[0]);
    wsClient.channel = channels[0];
  }
  
  return wsClient;
}

export function getClient() {
  return wsClient;
}