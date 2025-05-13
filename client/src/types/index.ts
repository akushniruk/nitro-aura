/**
 * Game and WebSocket types for Nitro Aura
 */

// Player piece: X or O
export type PlayerSymbol = 'X' | 'O';

// Game board (3x3 grid)
export type Board = Array<PlayerSymbol | null>;

// Players in the game
export interface Players {
  X: string; // EOA address of X player (host)
  O: string; // EOA address of O player (guest)
}

// Game state from server
export interface GameState {
  roomId: string;
  board: Board;
  nextTurn: PlayerSymbol;
  players: Players;
}

// Game over state
export interface GameOver {
  winner: PlayerSymbol | null; // null for draw
  board: Board;
}

// Room join payload
export interface JoinRoomPayload {
  roomId?: string | undefined; // Explicitly marked as optional
  eoa: string;
}

// Move payload
export interface MovePayload {
  roomId: string;
  pos: number; // 0-8
}

// WebSocket message types
export type WebSocketMessageType = 
  | 'joinRoom'
  | 'startGame'
  | 'move'
  | 'room:state'
  | 'room:ready'
  | 'room:created'
  | 'game:started'
  | 'game:over'
  | 'error';

// Base WebSocket message
export interface WebSocketMessage {
  type: WebSocketMessageType;
}

// Client -> Server messages

export interface JoinRoomMessage extends WebSocketMessage {
  type: 'joinRoom';
  payload: JoinRoomPayload;
}

export interface StartGamePayload {
  roomId: string;
}

export interface StartGameMessage extends WebSocketMessage {
  type: 'startGame';
  payload: StartGamePayload;
}

export interface MoveMessage extends WebSocketMessage {
  type: 'move';
  payload: MovePayload;
}

// Server -> Client messages

export interface RoomStateMessage extends WebSocketMessage, GameState {
  type: 'room:state';
}

export interface RoomReadyMessage extends WebSocketMessage {
  type: 'room:ready';
  roomId: string;
}

export interface RoomCreatedMessage extends WebSocketMessage {
  type: 'room:created';
  roomId: string;
  role: 'host' | 'guest';
}

export interface GameStartedMessage extends WebSocketMessage {
  type: 'game:started';
  roomId: string;
  firstTurn: PlayerSymbol;
}

export interface GameOverMessage extends WebSocketMessage, GameOver {
  type: 'game:over';
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  code: string;
  msg: string;
}

// Union type for all WebSocket messages
export type WebSocketMessages =
  | JoinRoomMessage
  | StartGameMessage
  | MoveMessage
  | RoomStateMessage
  | RoomReadyMessage
  | RoomCreatedMessage
  | GameStartedMessage
  | GameOverMessage
  | ErrorMessage;