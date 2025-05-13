import { useState, useEffect } from 'react';
import { JoinRoomPayload, AvailableRoom } from '../types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { Wallet, Users, Loader2, KeyRound, GamepadIcon, RefreshCw, Clock } from 'lucide-react';

interface LobbyProps {
  onJoinRoom: (payload: JoinRoomPayload) => void;
  isConnected: boolean;
  error: string | null;
  availableRooms?: AvailableRoom[];
  onGetAvailableRooms: () => void;
}

export function Lobby({ onJoinRoom, isConnected, error, availableRooms = [], onGetAvailableRooms }: LobbyProps) {
  const [eoa, setEoa] = useState('');
  const [roomId, setRoomId] = useState('');
  const [eoaError, setEoaError] = useState('');
  const [roomIdError, setRoomIdError] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [loadingRooms, setLoadingRooms] = useState(false);
  
  // Fetch available rooms when tab changes to 'join'
  useEffect(() => {
    if (mode === 'join' && isConnected) {
      setLoadingRooms(true);
      onGetAvailableRooms();
      // Set a timeout to hide the loading indicator after 2 seconds
      // (in case the server doesn't respond or takes too long)
      const timeoutId = setTimeout(() => {
        setLoadingRooms(false);
      }, 2000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [mode, isConnected, onGetAvailableRooms]);
  
  // When availableRooms changes, stop the loading indicator
  useEffect(() => {
    setLoadingRooms(false);
  }, [availableRooms]);

  // Validate Ethereum address format
  const validateEoa = (address: string): boolean => {
    // Basic EOA validation - 0x followed by 40 hex characters
    const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
    setEoaError(isValid ? '' : 'Please enter a valid Ethereum address');
    return isValid;
  };

  // Validate Room ID format for joining
  const validateRoomId = (id: string): boolean => {
    // For joining, room ID is required
    if (mode === 'join') {
      if (!id.trim()) {
        setRoomIdError('Room ID is required when joining a game');
        return false;
      }
      
      // Should be a valid UUID format (8-4-4-4-12 hex chars)
      const isValid = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(id);
      setRoomIdError(isValid ? '' : 'Please enter a valid room ID (UUID format)');
      return isValid;
    }
    
    // For creating, room ID is ignored
    return true;
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    setMode(value as 'create' | 'join');
    setRoomIdError('');
    
    // Fetch available rooms when switching to join tab
    if (value === 'join' && isConnected) {
      onGetAvailableRooms();
    }
  };
  
  // Helper function to format time since creation
  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const secondsAgo = Math.floor((now - timestamp) / 1000);
    
    if (secondsAgo < 60) {
      return `${secondsAgo} second${secondsAgo !== 1 ? 's' : ''} ago`;
    }
    
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) {
      return `${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago`;
    }
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    return `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''} ago`;
  };
  
  // Handle joining a specific available room
  const handleJoinAvailableRoom = (selectedRoomId: string) => {
    if (!validateEoa(eoa)) {
      return;
    }
    
    console.log("Joining available room with EOA:", eoa, "and roomId:", selectedRoomId);
    onJoinRoom({ eoa, roomId: selectedRoomId });
  };

  // Handle manual refresh of available rooms
  const handleRefreshRooms = () => {
    if (isConnected) {
      setLoadingRooms(true);
      onGetAvailableRooms();
    }
  };

  // Handle form submission
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    
    const isEoaValid = validateEoa(eoa);
    const isRoomIdValid = validateRoomId(roomId);
    
    if (!isEoaValid || !isRoomIdValid) {
      return;
    }
    
    if (mode === 'create') {
      // When creating a room, always pass undefined for roomId
      console.log("Creating a room with EOA:", eoa);
      onJoinRoom({ eoa, roomId: undefined });
    } else {
      // When joining, use the entered roomId
      console.log("Joining a room with EOA:", eoa, "and roomId:", roomId.trim());
      onJoinRoom({ eoa, roomId: roomId.trim() });
    }
  };

  return (
    <div className="flex flex-col items-center relative">
      {/* Animated glow behind card */}
      <div className="absolute -inset-8 bg-gradient-to-br from-cyan-500/5 via-transparent to-fuchsia-500/5 rounded-full blur-2xl"></div>
      
      <Card className="w-full max-w-md mx-auto shadow-[0_0_30px_rgba(0,229,255,0.15)] border-gray-800/50 bg-gray-900/80 backdrop-blur-sm overflow-hidden">
        {/* Header with particle effect */}
        <CardHeader className="text-center relative">
          <div className="absolute inset-0 opacity-10 overflow-hidden">
            <div className="absolute w-full h-[200%] top-[-50%] left-0 bg-[radial-gradient(circle,_white_1px,_transparent_1px)] bg-[length:20px_20px] opacity-20 animate-sparkle"></div>
          </div>
          
          <CardTitle className="text-5xl font-bold mb-2 relative z-10">
            <span className="text-glow-cyan">Nitro</span>
            <span className="text-glow-magenta ml-1">Aura</span>
          </CardTitle>
          <CardDescription className="text-base">Every move leaves an aura.</CardDescription>
        </CardHeader>

        <CardContent className="relative z-10">
          <Tabs defaultValue="create" onValueChange={handleTabChange}>
            <TabsList className="grid grid-cols-2 p-1 mb-5">
              <TabsTrigger 
                value="create" 
                className="data-[state=active]:bg-cyan-950/50 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                disabled={!isConnected}
              >
                <GamepadIcon className="w-4 h-4 mr-2" />
                Create Game
              </TabsTrigger>
              <TabsTrigger 
                value="join" 
                className="data-[state=active]:bg-fuchsia-950/50 data-[state=active]:text-fuchsia-400 data-[state=active]:shadow-[0_0_10px_rgba(255,73,225,0.2)]"
                disabled={!isConnected}
              >
                <Users className="w-4 h-4 mr-2" />
                Join Game
              </TabsTrigger>
            </TabsList>
            
            <form onSubmit={handleSubmit} className="space-y-6 mt-2">
              {/* Wallet address input */}
              <div className="space-y-1.5">
                <label htmlFor="eoa" className="block text-sm font-medium text-gray-300 flex items-center">
                  <Wallet className="h-4 w-4 mr-1.5 text-gray-500" />
                  Ethereum Address
                </label>
                <Input
                  id="eoa"
                  type="text"
                  value={eoa}
                  onChange={(e) => setEoa(e.target.value)}
                  placeholder="0x..."
                  icon={<Wallet className="h-4 w-4" />}
                  variant={mode === 'create' ? 'cyan' : 'magenta'}
                  className={cn(eoaError && "border-red-500 focus-visible:ring-red-500")}
                  required
                />
                {eoaError && (
                  <p className="mt-1 text-sm text-red-400 flex items-center">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5"></span>
                    {eoaError}
                  </p>
                )}
              </div>
              
              {/* Join tab content */}
              <TabsContent value="join" className="space-y-5 mt-4 mb-0">
                {/* Available games list */}
                <div className="rounded-md bg-fuchsia-950/10 p-4 border border-fuchsia-900/20 shadow-inner space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-fuchsia-400 font-medium flex items-center">
                      <Users className="h-4 w-4 mr-1.5" />
                      Available Games
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2 text-gray-400 hover:text-fuchsia-400"
                      onClick={handleRefreshRooms}
                      disabled={!isConnected || loadingRooms}
                    >
                      <RefreshCw className={cn(
                        "h-4 w-4 mr-1",
                        loadingRooms && "animate-spin"
                      )} />
                      Refresh
                    </Button>
                  </div>
                  
                  {loadingRooms ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="flex flex-col items-center space-y-2">
                        <Loader2 className="h-6 w-6 text-fuchsia-400 animate-spin" />
                        <p className="text-sm text-gray-400">Loading available games...</p>
                      </div>
                    </div>
                  ) : availableRooms.length > 0 ? (
                    <div className="space-y-2">
                      {availableRooms.map((room) => (
                        <div 
                          key={room.roomId}
                          className="bg-gray-800/50 rounded-md p-3 border border-gray-700/40 hover:border-fuchsia-800/30 group transition-all hover:bg-gray-800/70"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center">
                                <span className="text-gray-300 font-mono text-sm truncate max-w-[200px]">
                                  {room.roomId}
                                </span>
                              </div>
                              <div className="flex items-center mt-1 text-xs text-gray-500">
                                <Clock className="h-3 w-3 mr-1" />
                                <span>Created {formatTimeAgo(room.createdAt)}</span>
                              </div>
                            </div>
                            <Button
                              variant="glowMagenta"
                              size="sm"
                              className="ml-2 whitespace-nowrap"
                              disabled={!isConnected || !eoa}
                              onClick={() => handleJoinAvailableRoom(room.roomId)}
                            >
                              Join
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 space-y-2 text-gray-400">
                      <Users className="h-10 w-10 opacity-20" />
                      <p className="text-sm">No games available</p>
                      <p className="text-xs opacity-70">Create a new game or try again later</p>
                    </div>
                  )}
                </div>
                
                {/* Manual room ID entry */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="roomId" className="block text-sm font-medium text-gray-300 flex items-center">
                      <KeyRound className="h-4 w-4 mr-1.5 text-gray-500" />
                      Room ID
                    </label>
                    <p className="text-xs text-gray-500">Or enter room ID manually</p>
                  </div>
                  <Input
                    id="roomId"
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="Enter the room ID to join"
                    icon={<KeyRound className="h-4 w-4" />}
                    variant="magenta"
                    className={cn(roomIdError && "border-red-500 focus-visible:ring-red-500")}
                    required
                  />
                  {roomIdError && (
                    <p className="mt-1 text-sm text-red-400 flex items-center">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5"></span>
                      {roomIdError}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 pl-1">
                    Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                  </p>
                </div>
              </TabsContent>
              
              {/* Create tab content */}
              <TabsContent value="create" className="space-y-4 mt-4 mb-0">
                <div className="rounded-md bg-cyan-950/20 p-4 text-sm text-gray-300 border border-cyan-900/30 shadow-inner">
                  <p className="mb-2 text-cyan-400 font-medium flex items-center">
                    <GamepadIcon className="h-4 w-4 mr-1.5" />
                    Host a New Game
                  </p>
                  <p className="text-sm opacity-90">You'll create a room and get a Room ID to share with your opponent.</p>
                </div>
              </TabsContent>
              
              {/* Error message */}
              {error && (
                <div className="text-sm text-red-400 p-3 bg-red-900/20 border border-red-900/30 rounded-md shadow-inner animate-pulse">
                  <p className="font-medium mb-1">Error</p>
                  <p>{error}</p>
                </div>
              )}
              
              {/* Submit button */}
              <Button
                type="submit"
                disabled={!isConnected}
                variant={mode === 'create' ? 'glowCyan' : 'glowMagenta'}
                size="xxl"
                className="w-full mt-6"
                leftIcon={!isConnected ? <Loader2 className="animate-spin" /> : undefined}
              >
                {!isConnected ? 'Connecting...' : mode === 'create' ? 'Create Game' : 'Join Game'}
              </Button>
            </form>
          </Tabs>
        </CardContent>
        
        {/* Card footer with tagline */}
        <CardFooter className="justify-center opacity-60 py-3 border-t border-gray-800/30">
          <p className="text-xs text-gray-500">Light speed, neon bleed.</p>
        </CardFooter>
      </Card>
    </div>
  );
}