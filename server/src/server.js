/**
 * WebSocket server for Nitro Aura Tic Tac Toe game
 */

import { WebSocketServer } from 'ws';
import { createRoomManager } from './roomManager.js';
import { validateJoinRoomPayload, validateMovePayload } from './validators.js';
import { formatGameState, formatGameOverMessage, createGame } from './ticTacToe.js';

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });
const roomManager = createRoomManager();

// Track active connections
// TODO: Use @erc7824/nitrolite for connection tracking when available
const connections = new Map();

/**
 * Sends an error message to a client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} code - Error code
 * @param {string} msg - Error message
 */
function sendError(ws, code, msg) {
  ws.send(JSON.stringify({
    type: 'error',
    code,
    msg
  }));
}

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
        handleJoinRoom(ws, data.payload);
        break;
      case 'startGame':
        handleStartGame(ws, data.payload);
        break;
      case 'move':
        handleMove(ws, data.payload);
        break;
      case 'getAvailableRooms':
        handleGetAvailableRooms(ws);
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

/**
 * Handles a request to join a room
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} payload - Request payload
 */
function handleJoinRoom(ws, payload) {
  // Validate payload
  const validation = validateJoinRoomPayload(payload);
  if (!validation.success) {
    return sendError(ws, 'INVALID_PAYLOAD', validation.error);
  }

  const { roomId, eoa } = payload;
  console.log(`Processing ${validation.isCreating ? 'CREATE' : 'JOIN'} request for EOA: ${eoa}, roomId: ${roomId || 'NEW'}`);

  // Check if address is already connected
  if (connections.has(eoa)) {
    return sendError(ws, 'ALREADY_CONNECTED', 'Address already connected');
  }

  let result;
  if (validation.isCreating) {
    // Creating a new room
    const newRoomId = roomManager.createRoom();
    console.log(`Created new room with ID: ${newRoomId}`);
    
    // Join the newly created room as host
    result = roomManager.joinRoom(newRoomId, eoa, ws);
    
    if (result.success) {
      console.log(`New room created: ${newRoomId} for player (host): ${eoa}`);
      
      // Send room ID to client immediately so they can share it
      ws.send(JSON.stringify({
        type: 'room:created',
        roomId: newRoomId,
        role: 'host'
      }));
    }
  } else {
    // Joining an existing room
    result = roomManager.joinRoom(roomId, eoa, ws);
    
    if (result.success) {
      console.log(`Player ${eoa} joined room: ${roomId} as ${result.role}`);
    }
  }
  
  if (!result.success) {
    return sendError(ws, 'JOIN_FAILED', result.error);
  }

  // Store connection
  connections.set(eoa, { ws, roomId: result.roomId });

  // Get room
  const room = roomManager.rooms.get(result.roomId);

  // Send room state to all players
  if (room.gameState) {
    roomManager.broadcastToRoom(
      result.roomId, 
      'room:state', 
      formatGameState(room.gameState, result.roomId)
    );
  }

  // Notify all players that room is ready if applicable
  if (result.isRoomReady) {
    roomManager.broadcastToRoom(result.roomId, 'room:ready', { roomId: result.roomId });
  }
}

/**
 * Handles a start game request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} payload - Request payload
 */
function handleStartGame(ws, payload) {
  if (!payload || typeof payload !== 'object') {
    return sendError(ws, 'INVALID_PAYLOAD', 'Invalid payload format');
  }

  const { roomId } = payload;

  if (!roomId) {
    return sendError(ws, 'INVALID_PAYLOAD', 'Room ID is required');
  }

  // Find the player trying to start the game
  let playerEoa = null;
  for (const [eoa, connection] of connections.entries()) {
    if (connection.ws === ws) {
      playerEoa = eoa;
      break;
    }
  }

  if (!playerEoa) {
    return sendError(ws, 'NOT_AUTHENTICATED', 'Player not authenticated');
  }

  // Get the room
  const room = roomManager.rooms.get(roomId);
  if (!room) {
    return sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
  }

  // Only the host can start the game
  if (room.players.host !== playerEoa) {
    return sendError(ws, 'NOT_AUTHORIZED', 'Only the host can start the game');
  }

  // Need both players
  if (!room.players.host || !room.players.guest) {
    return sendError(ws, 'ROOM_NOT_FULL', 'Room must have two players to start the game');
  }

  // Initialize game state if not already done
  if (!room.gameState) {
    room.gameState = createGame(room.players.host, room.players.guest);
  }

  // Broadcast game started
  roomManager.broadcastToRoom(
    roomId,
    'game:started',
    { roomId, firstTurn: 'X' }
  );

  // Send the initial game state
  roomManager.broadcastToRoom(
    roomId, 
    'room:state', 
    formatGameState(room.gameState, roomId)
  );
}

/**
 * Handles a move request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} payload - Request payload
 */
function handleMove(ws, payload) {
  // Validate payload
  const validation = validateMovePayload(payload);
  if (!validation.success) {
    return sendError(ws, 'INVALID_PAYLOAD', validation.error);
  }

  const { roomId, pos } = payload;
  
  // Find the player making the move
  let playerEoa = null;
  for (const [eoa, connection] of connections.entries()) {
    if (connection.ws === ws) {
      playerEoa = eoa;
      break;
    }
  }

  if (!playerEoa) {
    return sendError(ws, 'NOT_AUTHENTICATED', 'Player not authenticated');
  }

  // Process the move
  const result = roomManager.processMove(roomId, pos, playerEoa);
  if (!result.success) {
    return sendError(ws, 'MOVE_FAILED', result.error);
  }

  // Broadcast updated game state
  roomManager.broadcastToRoom(
    roomId, 
    'room:state', 
    formatGameState(result.gameState, roomId)
  );

  // Handle game over condition
  if (result.isGameOver) {
    roomManager.broadcastToRoom(
      roomId, 
      'game:over', 
      formatGameOverMessage(result.gameState)
    );

    // Clean up the room after a short delay
    setTimeout(() => {
      roomManager.closeRoom(roomId);
    }, 5000);
  }
}

/**
 * Handles a request to get available rooms
 * @param {WebSocket} ws - WebSocket connection
 */
function handleGetAvailableRooms(ws) {
  // Filter rooms that are not full
  const availableRooms = [];
  
  // Get current timestamp
  const now = Date.now();
  
  // Iterate through all rooms and find available ones
  for (const [roomId, room] of roomManager.rooms.entries()) {
    // Room is available if it has a host but no guest, and game is not started
    if (room.players.host && !room.players.guest && !room.gameState) {
      availableRooms.push({
        roomId,
        hostAddress: room.players.host,
        createdAt: room.createdAt || now // Use tracked creation time or fall back to now
      });
    }
  }
  
  // Send available rooms to client
  ws.send(JSON.stringify({
    type: 'room:available',
    rooms: availableRooms
  }));
}

// Start server
console.log('WebSocket server started on port 8080');

// Simple keepalive mechanism
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify({ type: 'ping' }));
    }
  });
}, 30000);