import React, { useState, useEffect } from 'react';
import { Lobby } from './Lobby';
import { ChannelDeposit } from './ChannelDeposit';
import { useChannel } from '../hooks/useChannel';
import { useWebSocketContext } from '../context/WebSocketContext';
import type { JoinRoomPayload, AvailableRoom } from "../types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Integrated game lobby that handles channel state
 */
interface GameLobbyIntegratedProps {
  onJoinRoom: (payload: JoinRoomPayload) => void;
  availableRooms: AvailableRoom[];
  onGetAvailableRooms: () => void;
}

export function GameLobbyIntegrated({ 
  onJoinRoom, 
  availableRooms = [],
  onGetAvailableRooms
}: GameLobbyIntegratedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const { isConnected, status } = useWebSocketContext();
  const { isChannelOpen } = useChannel();

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Shared header component
  const AppHeader = () => (
    <div className="mb-8 text-center">
      <h1 className="text-3xl sm:text-4xl font-bold">
        <span className="text-glow-cyan">Nitro</span>
        <span className="text-glow-magenta ml-1">Aura</span>
      </h1>
      <p className="text-gray-400 text-sm mt-1">Every move leaves an aura.</p>
    </div>
  );

  // Show loading state
  if (isLoading) {
    return (
      <>
        <AppHeader />
        <div className="flex justify-center items-center min-h-[220px]">
          <Loader2 className="h-12 w-12 animate-spin text-cyan-400" />
        </div>
      </>
    );
  }

  // Show connection status if not connected
  if (!isConnected) {
    return (
      <>
        <AppHeader />
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl text-amber-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> WebSocket Status: {status}
            </CardTitle>
            <CardDescription>
              Connecting to the game server...
              {status === 'reconnect_failed' && (
                <span className="block mt-2 text-red-400">
                  Connection failed. Please refresh the page and try again.
                </span>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  // The channel creation is now handled on-demand when joining/creating a game
  // We'll keep this code commented for reference
  /*
  if (!isChannelOpen) {
    return (
      <>
        <AppHeader />
        <div className="space-y-4">
          <Card className="mb-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl text-cyan-400">Channel Required</CardTitle>
              <CardDescription>
                You need to create a channel and deposit funds to play games.
              </CardDescription>
            </CardHeader>
          </Card>
          
          <ChannelDeposit />
        </div>
      </>
    );
  }
  */

  // Show the game lobby when connected and channel is open
  return (
    <>
      {/* App header for lobby view */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold">
          <span className="text-glow-cyan">Nitro</span>
          <span className="text-glow-magenta ml-1">Aura</span>
        </h1>
        <p className="text-gray-400 text-sm mt-1">Every move leaves an aura.</p>
      </div>
      
      <Lobby 
        onJoinRoom={onJoinRoom}
        isConnected={isConnected}
        error={null}
        availableRooms={availableRooms}
        onGetAvailableRooms={onGetAvailableRooms}
      />
    </>
  );
}