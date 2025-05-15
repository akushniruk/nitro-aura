/**
 * WebSocket server for Nitro Aura Tic Tac Toe game
 */

import { createWebSocketServer, sendError, startPingInterval } from './config/websocket.js';
import { initializeClient } from './services/nitroliteClient.js';
import { createRoomManager } from './services/roomManager.js';
import { handleJoinRoom, handleGetAvailableRooms } from './routes/roomRoutes.js';
import { handleStartGame, handleMove } from './routes/gameRoutes.js';

// Create WebSocket server
const wss = createWebSocketServer();
const roomManager = createRoomManager();

// Track active connections
// TODO: Use @erc7824/nitrolite for connection tracking when available
const connections = new Map();

// Create context object to share between route handlers
const context = {
  roomManager,
  connections,
  sendError: (ws, code, msg) => sendError(ws, code, msg)
};

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Handle client messages
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return sendError(ws, 'INVALID_JSON', 'Invalid JSON format');
    }

    // Process message based on type
    switch (data.type) {
      case 'joinRoom':
        handleJoinRoom(ws, data.payload, context);
        break;
      case 'startGame':
        handleStartGame(ws, data.payload, context);
        break;
      case 'move':
        handleMove(ws, data.payload, context);
        break;
      case 'getAvailableRooms':
        handleGetAvailableRooms(ws, context);
        break;
      default:
        sendError(ws, 'INVALID_MESSAGE_TYPE', 'Invalid message type');
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    // Find and remove the player from any room
    for (const [eoa, connection] of connections.entries()) {
      if (connection.ws === ws) {
        const result = roomManager.leaveRoom(eoa);
        if (result.success && result.roomId) {
          roomManager.broadcastToRoom(result.roomId, 'room:state', {
            roomId: result.roomId,
            // Send updated room state here
          });
        }
        connections.delete(eoa);
        break;
      }
    }
    console.log('Client disconnected');
  });
});

// Initialize Nitrolite client and channel when server starts
async function initializeNitroliteChannel() {
  try {
    console.log('Initializing Nitrolite client and channel...');
    const client = await initializeClient();
    console.log('Nitrolite client initialized successfully');
    
    if (client.channel) {
      console.log('Connected to existing channel:', client.channel);
    } else {
      console.log('No channel established. Something went wrong during initialization.');
    }
  } catch (error) {
    console.error('Failed to initialize Nitrolite client and channel:', error);
  }
}

// Start server
const port = process.env.PORT || 8080;
console.log(`WebSocket server starting on port ${port}`);

// Initialize Nitrolite client and channel
initializeNitroliteChannel().then(() => {
  console.log('Server initialization complete');
}).catch(error => {
  console.error('Server initialization failed:', error);
});

// Start keepalive mechanism
startPingInterval(wss);