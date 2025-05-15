/**
 * Game-related WebSocket message handlers
 */

import { validateMovePayload } from '../utils/validators.js';
import { formatGameState, formatGameOverMessage, createGame } from '../services/ticTacToe.js';

/**
 * Handles a start game request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} payload - Request payload
 * @param {Object} context - Application context containing roomManager and connections
 */
export function handleStartGame(ws, payload, { roomManager, connections, sendError }) {
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
 * @param {Object} context - Application context containing roomManager and connections
 */
export function handleMove(ws, payload, { roomManager, connections, sendError }) {
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