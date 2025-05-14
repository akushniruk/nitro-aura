import React, { useState } from 'react';
import { useChannel } from '../hooks/useChannel';
import { WalletStore } from '../store';
import { useStore } from '../store/storeUtils';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

// Default USDC token address on Polygon
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

/**
 * Component for depositing funds and creating a channel
 */
export function ChannelDeposit() {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const { createChannel, depositToChannel, isChannelOpen } = useChannel();
  const wallet = useStore(WalletStore.state);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers with up to 6 decimal places (for USDC)
    const value = e.target.value;
    if (/^\d*\.?\d{0,6}$/.test(value) || value === '') {
      setAmount(value);
    }
  };

  const handleCreateChannel = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // First create a channel
      await createChannel(USDC_ADDRESS, amount);
      
      // Then deposit to it
      await depositToChannel(USDC_ADDRESS, amount);
      
      setSuccessMessage(`Successfully created channel and deposited ${amount} USDC`);
    } catch (err) {
      console.error('Channel creation/deposit error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  if (isChannelOpen) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl text-cyan-400">Channel Active</CardTitle>
          <CardDescription>
            You have an active channel with {wallet.channelAmount ? Number(wallet.channelAmount) / 1000000 : '0'} USDC deposited.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button 
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90"
            onClick={() => {
              // In a real app you might want a separate component for this
              // This is just a placeholder
              alert('Close channel functionality would go here');
            }}
          >
            Close Channel
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl text-cyan-400">Create Channel</CardTitle>
        <CardDescription>
          Create a new channel by depositing USDC. This is required to play games.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded-md text-sm">
            {error}
          </div>
        )}
        
        {successMessage && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-800 text-green-200 rounded-md text-sm">
            {successMessage}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">
            USDC Amount
          </label>
          <div className="relative">
            <Input
              type="text"
              name="amount"
              id="amount"
              className="pl-3 pr-12"
              placeholder="0.00"
              aria-describedby="amount-currency"
              value={amount}
              onChange={handleAmountChange}
              disabled={isProcessing}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="text-gray-400 sm:text-sm" id="amount-currency">
                USDC
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Minimum deposit: 0.1 USDC
          </p>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          className={cn(
            "bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-90",
            (isProcessing || !amount || parseFloat(amount) < 0.1) && 
            "bg-gray-700 text-gray-400 opacity-50 cursor-not-allowed hover:opacity-50"
          )}
          onClick={handleCreateChannel}
          disabled={isProcessing || !amount || parseFloat(amount) < 0.1}
        >
          {isProcessing ? 'Processing...' : 'Create & Deposit'}
        </Button>
      </CardFooter>
    </Card>
  );
}