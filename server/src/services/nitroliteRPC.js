/**
 * Nitrolite RPC (WebSocket) client
 * This file handles all WebSocket communication with Nitrolite server
 */
import WebSocket from "ws";
import { ethers } from "ethers";
import { NitroliteRPC, createAuthRequestMessage, createAuthVerifyMessage, createPingMessage } from "@erc7824/nitrolite";
import dotenv from "dotenv";
import logger from "../utils/logger.js";
import { getNitroliteOnChainClient, createChannel } from "./nitroliteOnChain.js";

/**
 * EIP-712 domain and types for auth_verify challenge
 */
const getAuthDomain = () => {
    return {
        name: "Nitro Aura",
    };
};

const AUTH_TYPES = {
    AuthVerify: [
        { name: "address", type: "address" },
        { name: "challenge", type: "string" },
        { name: "session_key", type: "address" },
        { name: "allowances", type: "Allowance[]" },
    ],
    Allowance: [
        { name: "asset", type: "string" },
        { name: "amount", type: "uint256" },
    ],
};

// Load environment variables
dotenv.config();

// Connection status
export const WSStatus = {
    CONNECTED: "connected",
    CONNECTING: "connecting",
    DISCONNECTED: "disconnected",
    RECONNECTING: "reconnecting",
    RECONNECT_FAILED: "reconnect_failed",
    AUTH_FAILED: "auth_failed",
    AUTHENTICATING: "authenticating",
};

// Server-side WebSocket client with authentication
export class NitroliteRPCClient {
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

        logger.system(`RPC client initialized with address: ${this.address}`);
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
            logger.ws("Already connected or connecting...");
            return;
        }

        try {
            logger.ws(`Connecting to ${this.url}...`);
            this.setStatus(WSStatus.CONNECTING);

            this.ws = new WebSocket(this.url);

            this.ws.on("open", async () => {
                logger.ws("WebSocket connection established");
                this.setStatus(WSStatus.AUTHENTICATING);
                try {
                    await this.authenticate();
                    logger.auth("Successfully authenticated with the WebSocket server");
                    // Note: Status should already be CONNECTED from inside authenticate()
                    this.reconnectAttempts = 0;
                    this.startPingInterval();
                } catch (error) {
                    logger.error("Authentication failed:", error);
                    this.setStatus(WSStatus.AUTH_FAILED);
                    this.ws.close();
                }
            });

            this.ws.on("message", (data) => {
                this.handleMessage(data);
            });

            this.ws.on("error", (error) => {
                logger.error("WebSocket error:", error);
            });

            this.ws.on("close", () => {
                logger.ws("WebSocket connection closed");
                this.setStatus(WSStatus.DISCONNECTED);
                clearInterval(this.pingInterval);
                this.handleReconnect();
            });
        } catch (error) {
            logger.error("Failed to connect:", error);
            this.setStatus(WSStatus.DISCONNECTED);
            this.handleReconnect();
        }
    }

    // Update status and notify listeners
    setStatus(status) {
        const prevStatus = this.status;
        this.status = status;
        logger.ws(`Status changed: ${prevStatus} -> ${status}`);
        this.onStatusChangeCallbacks.forEach((callback) => callback(status));
    }

    // Sign message function that can be reused across the client
    async signMessage(data) {
        logger.auth(`Signing message: ${typeof data === "string" ? data.slice(0, 50) : JSON.stringify(data).slice(0, 50)}...`);

        let challengeUUID = "";
        const address = this.address;

        // The data coming in is the array from createAuthVerifyMessage
        // Format: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
        if (Array.isArray(data)) {
            logger.auth("Data is array, extracting challenge from position [2][0].challenge");

            // Direct array access - data[2] should be the array with the challenge object
            if (data.length >= 3 && Array.isArray(data[2]) && data[2].length > 0) {
                const challengeObject = data[2][0];

                if (challengeObject && challengeObject.challenge) {
                    challengeUUID = challengeObject.challenge;
                    logger.auth("Extracted challenge UUID from array:", challengeUUID);
                }
            }
        } else if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data);

                logger.auth("Parsed challenge data:", parsed);

                // Handle different message structures
                if (parsed.res && Array.isArray(parsed.res)) {
                    // auth_challenge response: {"res": [id, "auth_challenge", {"challenge": "uuid"}, timestamp]}
                    if (parsed.res[1] === "auth_challenge" && parsed.res[2]) {
                        challengeUUID = parsed.res[2].challenge_message || parsed.res[2].challenge;
                        logger.auth("Extracted challenge UUID from auth_challenge:", challengeUUID);
                    }
                    // auth_verify message: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
                    else if (parsed.res[1] === "auth_verify" && Array.isArray(parsed.res[2]) && parsed.res[2][0]) {
                        challengeUUID = parsed.res[2][0].challenge;
                        logger.auth("Extracted challenge UUID from auth_verify:", challengeUUID);
                    }
                }
                // Direct array format
                else if (Array.isArray(parsed) && parsed.length >= 3 && Array.isArray(parsed[2])) {
                    challengeUUID = parsed[2][0]?.challenge;
                    logger.auth("Extracted challenge UUID from direct array:", challengeUUID);
                }
            } catch (e) {
                logger.error("Could not parse challenge data:", e);
                logger.auth("Using raw string as challenge");
                challengeUUID = data;
            }
        } else if (data && typeof data === "object") {
            // If data is already an object, try to extract challenge
            challengeUUID = data.challenge || data.challenge_message;
            logger.auth("Extracted challenge from object:", challengeUUID);
        }

        if (!challengeUUID || challengeUUID.includes("[") || challengeUUID.includes("{")) {
            logger.error("Challenge extraction failed or contains invalid characters:", challengeUUID);

            // Fallback to regular signing for non-auth messages
            if (!challengeUUID) {
                logger.auth("No challenge found, using regular message signing");
                const messageStr = typeof data === "string" ? data : JSON.stringify(data);
                const digestHex = ethers.id(messageStr);
                const messageBytes = ethers.getBytes(digestHex);

                const { serialized: signature } = this.wallet.signingKey.sign(messageBytes);
                return signature;
            }

            throw new Error("Could not extract valid challenge UUID for EIP-712 signing");
        }

        logger.auth("Final challenge UUID for EIP-712:", challengeUUID);
        logger.auth("Signing for address:", address);
        logger.auth("Auth domain:", getAuthDomain());

        // Create EIP-712 message with ONLY the challenge UUID
        const message = {
            address: address,
            challenge: challengeUUID,
            session_key: address, // Using wallet address as session key for server
            allowances: [
                {
                    asset: "usdc",
                    amount: "100000000000",
                },
            ],
        };

        logger.auth("EIP-712 message to sign:", message);

        try {
            // Sign with EIP-712 using ethers
            const signature = await this.wallet.signTypedData(getAuthDomain(), AUTH_TYPES, message);

            logger.auth("EIP-712 signature generated for challenge:", signature);
            return signature;
        } catch (eip712Error) {
            logger.error("EIP-712 signing failed:", eip712Error);
            logger.auth("Attempting fallback to regular message signing...");

            try {
                // Fallback to regular message signing if EIP-712 fails
                const fallbackMessage = `Authentication challenge for ${address}: ${challengeUUID}`;

                logger.auth("Fallback message:", fallbackMessage);

                const digestHex = ethers.id(fallbackMessage);
                const messageBytes = ethers.getBytes(digestHex);

                const { serialized: fallbackSignature } = this.wallet.signingKey.sign(messageBytes);

                logger.auth("Fallback signature generated:", fallbackSignature);
                return fallbackSignature;
            } catch (fallbackError) {
                logger.error("Fallback signing also failed:", fallbackError);
                throw new Error(`Both EIP-712 and fallback signing failed: ${eip712Error.message}`);
            }
        }
    }

    // Authenticate with WebSocket server
    async authenticate() {
        if (!this.ws) {
            throw new Error("WebSocket not connected");
        }

        logger.auth("Starting authentication process...");

        // Use the signMessage method for consistency
        const sign = this.signMessage.bind(this);

        return new Promise((resolve, reject) => {
            const authRequest = async () => {
                try {
                    const request = await createAuthRequestMessage({
                        address: this.address,
                        session_key: this.address,
                        app_name: "Nitro Aura",
                        allowances: [
                            {
                                symbol: "usdc",
                                amount: "100000000000",
                            },
                        ],
                    });
                    logger.auth("Sending auth request:", request.slice(0, 100) + "...");
                    this.ws.send(request);
                } catch (error) {
                    logger.error("Error creating auth request:", error);
                    reject(error);
                }
            };

            // Set up response handler
            const handleAuthResponse = async (data) => {
                try {
                    logger.auth(`Received authentication response: ${data.slice(0, 100)}...`);

                    const response = JSON.parse(data);

                    if (response.res && response.res[1] === "auth_challenge") {
                        logger.auth("Received auth challenge, sending verification...");

                        // Create EIP-712 signing function that matches the React implementation
                        const eip712SigningFunction = async (data) => {
                            logger.auth("Signing auth_verify challenge with EIP-712:", data);

                            let challengeUUID = "";
                            const address = this.address;

                            // The data coming in is the array from createAuthVerifyMessage
                            // Format: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
                            if (Array.isArray(data)) {
                                logger.auth("Data is array, extracting challenge from position [2][0].challenge");

                                // Direct array access - data[2] should be the array with the challenge object
                                if (data.length >= 3 && Array.isArray(data[2]) && data[2].length > 0) {
                                    const challengeObject = data[2][0];

                                    if (challengeObject && challengeObject.challenge) {
                                        challengeUUID = challengeObject.challenge;
                                        logger.auth("Extracted challenge UUID from array:", challengeUUID);
                                    }
                                }
                            } else if (typeof data === "string") {
                                try {
                                    const parsed = JSON.parse(data);
                                    logger.auth("Parsed challenge data:", parsed);

                                    // Handle different message structures
                                    if (parsed.res && Array.isArray(parsed.res)) {
                                        // auth_challenge response: {"res": [id, "auth_challenge", {"challenge": "uuid"}, timestamp]}
                                        if (parsed.res[1] === "auth_challenge" && parsed.res[2]) {
                                            challengeUUID = parsed.res[2].challenge_message || parsed.res[2].challenge;
                                            logger.auth("Extracted challenge UUID from auth_challenge:", challengeUUID);
                                        }
                                        // auth_verify message: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
                                        else if (parsed.res[1] === "auth_verify" && Array.isArray(parsed.res[2]) && parsed.res[2][0]) {
                                            challengeUUID = parsed.res[2][0].challenge;
                                            logger.auth("Extracted challenge UUID from auth_verify:", challengeUUID);
                                        }
                                    }
                                    // Direct array format
                                    else if (Array.isArray(parsed) && parsed.length >= 3 && Array.isArray(parsed[2])) {
                                        challengeUUID = parsed[2][0]?.challenge;
                                        logger.auth("Extracted challenge UUID from direct array:", challengeUUID);
                                    }
                                } catch (e) {
                                    logger.error("Could not parse challenge data:", e);
                                    logger.auth("Using raw string as challenge");
                                    challengeUUID = data;
                                }
                            } else if (data && typeof data === "object") {
                                // If data is already an object, try to extract challenge
                                challengeUUID = data.challenge || data.challenge_message;
                                logger.auth("Extracted challenge from object:", challengeUUID);
                            }

                            if (!challengeUUID || challengeUUID.includes("[") || challengeUUID.includes("{")) {
                                logger.error("Challenge extraction failed or contains invalid characters:", challengeUUID);
                                throw new Error("Could not extract valid challenge UUID for EIP-712 signing");
                            }

                            logger.auth("Final challenge UUID for EIP-712:", challengeUUID);
                            logger.auth("Signing for address:", address);
                            logger.auth("Auth domain:", getAuthDomain());

                            // Create EIP-712 message with ONLY the challenge UUID
                            const message = {
                                address: address,
                                challenge: challengeUUID,
                                session_key: this.address, // Using wallet address as session key for server
                                allowances: [
                                    {
                                        symbol: "usdc",
                                        amount: "100000000000",
                                    },
                                ],
                            };

                            logger.auth("EIP-712 message to sign:", message);

                            try {
                                // Sign with EIP-712 using ethers
                                const signature = await this.wallet.signTypedData(getAuthDomain(), AUTH_TYPES, message);

                                logger.auth("EIP-712 signature generated for challenge:", signature);
                                return signature;
                            } catch (eip712Error) {
                                logger.error("EIP-712 signing failed:", eip712Error);
                                logger.auth("Attempting fallback to regular message signing...");

                                try {
                                    // Fallback to regular message signing if EIP-712 fails
                                    const fallbackMessage = `Authentication challenge for ${address}: ${challengeUUID}`;

                                    logger.auth("Fallback message:", fallbackMessage);

                                    const digestHex = ethers.id(fallbackMessage);
                                    const messageBytes = ethers.getBytes(digestHex);

                                    const { serialized: fallbackSignature } = this.wallet.signingKey.sign(messageBytes);

                                    logger.auth("Fallback signature generated:", fallbackSignature);
                                    return fallbackSignature;
                                } catch (fallbackError) {
                                    logger.error("Fallback signing also failed:", fallbackError);
                                    throw new Error(`Both EIP-712 and fallback signing failed: ${eip712Error.message}`);
                                }
                            }
                        };

                        const authVerify = await createAuthVerifyMessage(eip712SigningFunction, data);
                        logger.auth(`Sending auth verification: ${authVerify.slice(0, 100)}...`);
                        this.ws.send(authVerify);
                    } else if (response.res && response.res[1] === "auth_verify") {
                        logger.auth("Authentication successful!");
                        this.ws.removeListener("message", authMessageHandler);

                        // Make sure status is set to CONNECTED before making any requests
                        this.setStatus(WSStatus.CONNECTED);

                        try {
                            // Request channel information for our address and check if we need to create one
                            const channels = await this.getChannelInfo();

                            // Check if we have valid channels
                            const hasValidChannel = channels && Array.isArray(channels) && channels.length > 0 && channels[0] !== null;

                            if (!hasValidChannel) {
                                logger.nitro("No valid channels found after authentication, will create one");
                                // We'll let the getChannelInfo response handle creation
                            }
                        } catch (error) {
                            logger.error("Failed to get channel info, continuing anyway:", error);
                            // Continue with authentication even if channel info fails
                        }

                        resolve();
                    } else if (response.err) {
                        logger.error("Authentication error:", response.err);
                        this.ws.removeListener("message", authMessageHandler);
                        reject(new Error(response.err[2] || "Authentication failed"));
                    }
                } catch (error) {
                    logger.error("Error handling auth response:", error);
                    this.ws.removeListener("message", authMessageHandler);
                    reject(error);
                }
            };

            const authMessageHandler = (data) => {
                handleAuthResponse(data.toString());
            };

            this.ws.on("message", authMessageHandler);

            // Start authentication process
            authRequest();

            // Set timeout
            setTimeout(() => {
                this.ws.removeListener("message", authMessageHandler);
                reject(new Error("Authentication timeout"));
            }, 10000);
        });
    }

    // Handle incoming WebSocket messages
    handleMessage(data) {
        try {
            // Ensure data is properly handled as string
            const rawData = typeof data === "string" ? data : data.toString();
            const message = JSON.parse(rawData);
            logger.data("Received message", message);

            // Notify callbacks first to allow for authentication handling
            this.onMessageCallbacks.forEach((callback) => callback(message));

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
            if (message.type === "channel_created") {
                logger.nitro("Channel created successfully");
                logger.data("Channel data", message.channel);
                this.channel = message.channel;
            }
        } catch (error) {
            logger.error("Error handling message:", error);
        }
    }

    // Send a request to the WebSocket server
    async sendRequest(method, params = {}) {
        if (!this.ws) {
            throw new Error("WebSocket instance not initialized");
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            logger.error(`WebSocket not in OPEN state. Current state: ${this.ws.readyState}, Status: ${this.status}`);
            throw new Error(`WebSocket not in OPEN state. Current readyState: ${this.ws.readyState}`);
        }

        if (this.status !== WSStatus.CONNECTED) {
            logger.warn(`WebSocket status is ${this.status}, should be ${WSStatus.CONNECTED}. Proceeding anyway.`);
            // Set the status to CONNECTED if it's in AUTHENTICATING but we've passed authentication
            if (this.status === WSStatus.AUTHENTICATING) {
                logger.system("Fixing status to CONNECTED for authenticated connection");
                this.setStatus(WSStatus.CONNECTED);
            }
        }

        const requestId = this.nextRequestId++;

        // Use the same signing function for consistency
        const sign = this.signMessage.bind(this);

        return new Promise(async (resolve, reject) => {
            try {
                const request = NitroliteRPC.createRequest(requestId, method, params);
                const signedRequest = await NitroliteRPC.signRequestMessage(sign, request);

                logger.ws(`Sending request: ${JSON.stringify(signedRequest).slice(0, 100)}...`);

                this.pendingRequests.set(requestId, { resolve, reject });

                // Set timeout
                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        reject(new Error("Request timeout"));
                    }
                }, 10000);

                this.ws.send(typeof signedRequest === "string" ? signedRequest : JSON.stringify(signedRequest));
            } catch (error) {
                logger.error("Error sending request:", error);
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
                    // Use the same signing function for consistency
                    const sign = this.signMessage.bind(this);

                    const pingMessage = await createPingMessage(sign);
                    // Don't log pings to reduce noise
                    this.ws.send(pingMessage);
                } catch (error) {
                    logger.error("Error sending ping:", error);
                }
            }
        }, 30000);
    }

    // Handle reconnection
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.ws("Maximum reconnect attempts reached");
            this.setStatus(WSStatus.RECONNECT_FAILED);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;

        logger.ws(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
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

        logger.ws("WebSocket connection closed manually");
        this.setStatus(WSStatus.DISCONNECTED);
    }

    // Get channel information
    async getChannelInfo() {
        try {
            logger.nitro("Requesting channel information...");
            const response = await this.sendRequest("get_channels", [{ participant: this.address }]);
            logger.data("Channel info received", response);

            // Debug the raw response
            logger.system("Debug - Raw channel response:");
            logger.system(`- response type: ${typeof response}`);
            logger.system(`- is array: ${Array.isArray(response)}`);
            logger.system(`- stringified: ${JSON.stringify(response)}`);

            // Check if we need to unwrap the response
            let channels = response;

            if (Array.isArray(response) && response.length === 1 && response[0] === null) {
                logger.system("Debug - Got array with single null item");
            }

            // Check if we have valid channels
            if (channels && Array.isArray(channels) && channels.length > 0 && channels[0] !== null) {
                logger.nitro(`Found ${channels.length} valid existing channels`);
                this.channel = channels[0];
                return channels;
            }

            logger.nitro("No valid channels found, creating a new one now");

            // Get the on-chain client if not already initialized
            if (!this.nitroliteClient) {
                logger.nitro("Getting Nitrolite on-chain client for channel creation...");
                this.nitroliteClient = await getNitroliteOnChainClient(this.privateKey);
            }

            // Create a channel in response to getChannelInfo
            try {
                logger.nitro("Creating new channel from getChannelInfo...");
                // const result = await createChannel(this.nitroliteClient);
                logger.nitro("Successfully created channel in response to getChannelInfo");
                logger.data("New channel created", result);

                // Make sure to set the channel
                if (result && result.channel) {
                    this.channel = result.channel;
                }

                // Return an array with the newly created channel
                return [this.channel];
            } catch (channelError) {
                logger.error("Failed to create channel in getChannelInfo response:", channelError);
                // Still return an empty array
                return [];
            }
        } catch (error) {
            logger.error("Error getting channel info:", error);
            throw error;
        }
    }
}

// Initialize and export the client instance
let rpcClient = null;

export async function initializeRPCClient() {
    logger.system("Initializing Nitrolite RPC client...");
    if (rpcClient) {
        logger.system("Nitrolite RPC client already initialized, returning existing instance...");
        return rpcClient;
    }

    try {
        logger.system("Initializing new Nitrolite RPC client...");

        if (!process.env.SERVER_PRIVATE_KEY) {
            throw new Error("SERVER_PRIVATE_KEY environment variable is not set");
        }

        if (!process.env.WS_URL) {
            throw new Error("WS_URL environment variable is not set");
        }

        rpcClient = new NitroliteRPCClient(process.env.WS_URL, process.env.SERVER_PRIVATE_KEY);

        // Log all WebSocket messages
        rpcClient.onMessage((message) => {
            logger.ws("RPC Message:", JSON.stringify(message, null, 2));
        });

        // Log status changes
        rpcClient.onStatusChange((status) => {
            logger.ws("RPC Status changed:", status);
        });

        // Connect to the WebSocket server
        await rpcClient.connect();

        // Initialize nitroliteClient property with on-chain client
        rpcClient.nitroliteClient = await getNitroliteOnChainClient(process.env.SERVER_PRIVATE_KEY);

        // Get existing channels
        logger.system("Checking for existing channels...");
        const channels = await rpcClient.getChannelInfo();

        // Check if we have valid channels
        const hasValidChannel = channels && Array.isArray(channels) && channels.length > 0 && channels[0] !== null;

        if (hasValidChannel) {
            logger.nitro(`Found ${channels.length} existing valid channels`);
            logger.data("Channel data", channels[0]);
            rpcClient.channel = channels[0];
        } else {
            // Log that no valid channels found
            logger.nitro("No valid channels found in initializeRPCClient");
            // Don't create channel here - it's handled by getChannelInfo
        }
    } catch (error) {
        logger.error("Error during RPC client initialization:", error);
        // Continue anyway - the server can still function for basic operations
    }

    return rpcClient;
}

export function getRPCClient() {
    return rpcClient;
}
