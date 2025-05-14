import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader2, AlertCircle, Coins, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
// Since we're importing from viem which isn't configured yet, let's declare the types here
type Address = `0x${string}`;
type Hex = `0x${string}`;
import { useChannel } from '../hooks/useChannel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

// USDC token address on the testnet
const USDC_ADDRESS: Hex = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';

interface ChannelRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (action: 'join' | 'create', roomId?: string) => void;
  mode: 'join' | 'create';
  roomId?: string;
}

export function ChannelRequiredModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  mode,
  roomId 
}: ChannelRequiredModalProps) {
  const [amount, setAmount] = useState('10');
  const [step, setStep] = useState<'info' | 'create' | 'success'>('info');
  const { createChannel, isLoading, error, isChannelOpen } = useChannel();

  // Check if already has channel open
  useEffect(() => {
    if (isChannelOpen && isOpen) {
      // If channel is already open, proceed directly
      onSuccess(mode, roomId);
      onClose();
    }
  }, [isChannelOpen, isOpen, onSuccess, onClose, mode, roomId]);

  const handleCreateChannel = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      return;
    }

    try {
      setStep('create');
      await createChannel(USDC_ADDRESS, amount);
      setStep('success');
      
      // Auto proceed after success
      setTimeout(() => {
        onSuccess(mode, roomId);
        onClose();
      }, 1500);
    } catch (err) {
      // Error state is handled by the useChannel hook
      setStep('info');
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimals
    const value = e.target.value.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const decimalCount = value.split('.').length - 1;
    if (decimalCount > 1) return;
    // Limit to 2 decimal places
    const parts = value.split('.');
    if (parts.length > 1 && parts[1].length > 2) return;
    
    setAmount(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-full border-gray-700 shadow-2xl relative overflow-hidden">
        {/* Background gradient */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-b",
          "from-cyan-900/30 to-gray-900/90",
          "z-0"
        )}></div>
        
        {/* Particle effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute w-full h-[200%] top-[-50%] left-0 bg-[radial-gradient(circle,_white_1px,_transparent_1px)] bg-[length:20px_20px] opacity-[0.03] animate-sparkle"></div>
        </div>
        
        {/* Content */}
        <div className="relative z-10">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-cyan-400 mb-2">
              {step === 'info' && 'Channel Required'}
              {step === 'create' && 'Creating Channel...'}
              {step === 'success' && 'Channel Created!'}
            </DialogTitle>
            <DialogDescription>
              {step === 'info' && (
                'To play Nitro Aura, you need to create a payment channel by depositing USDC.'
              )}
              {step === 'create' && (
                'Please confirm the transaction in your wallet.'
              )}
              {step === 'success' && (
                'Your payment channel has been created successfully!'
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {step === 'info' && (
              <div className="space-y-4">
                <div className="bg-black/20 rounded-lg p-4 text-sm text-gray-300 border border-cyan-900/30">
                  <p className="mb-2 flex items-center text-cyan-400">
                    <Coins className="h-4 w-4 mr-2" />
                    <span>Why deposit USDC?</span>
                  </p>
                  <p className="mb-2">
                    Nitro Aura uses payment channels to enable instant, secure gameplay without gas fees for each move.
                  </p>
                  <p>
                    Your funds remain fully under your control and can be withdrawn at any time.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-300">
                    Deposit Amount (USDC)
                  </label>
                  <Input
                    id="amount"
                    type="text"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="10"
                    prefix="$"
                    variant="cyan"
                  />
                  <p className="text-xs text-gray-500">
                    Recommended minimum: 10 USDC
                  </p>
                </div>
                
                {error && (
                  <div className="text-sm text-red-400 p-3 bg-red-900/20 border border-red-900/30 rounded-md flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Error</p>
                      <p>{error}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {step === 'create' && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-12 w-12 text-cyan-400 animate-spin" />
                <p className="text-gray-300">
                  Creating your payment channel...
                </p>
                <p className="text-sm text-gray-500">
                  Check your wallet for transaction confirmation
                </p>
              </div>
            )}
            
            {step === 'success' && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="h-16 w-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <svg className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-green-400">
                  Deposit Successful!
                </p>
                <p className="text-sm text-gray-400 text-center">
                  Your payment channel is now active.
                  <br />You'll be redirected to the game momentarily.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            {step === 'info' && (
              <>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateChannel}
                  variant="glowCyan"
                  className="w-full sm:w-auto"
                  disabled={isLoading || !amount}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Create Channel
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </>
            )}
            
            {step === 'create' && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for confirmation...
              </Button>
            )}
            
            {step === 'success' && (
              <Button
                onClick={() => {
                  onSuccess(mode, roomId);
                  onClose();
                }}
                variant="glowCyan"
                className="w-full sm:w-auto"
              >
                Continue to Game
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}