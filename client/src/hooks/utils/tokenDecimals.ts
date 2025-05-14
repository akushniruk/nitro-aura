import { Address } from 'viem';

// Common token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359': 6, // USDC on Polygon
  // Add more tokens as needed
};

// Default decimal places if token not found
const DEFAULT_DECIMALS = 18;

/**
 * Get the number of decimal places for a token
 * @param tokenAddress The token address
 * @returns The number of decimal places
 */
export function getTokenDecimals(tokenAddress: Address): number {
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || DEFAULT_DECIMALS;
}

/**
 * Parse a token amount from human-readable to contract units
 * @param tokenAddress The token address
 * @param amount The amount as a string
 * @returns The amount in BigInt
 */
export function parseTokenUnits(tokenAddress: Address, amount: string): bigint {
  const decimals = getTokenDecimals(tokenAddress);
  
  // Handle numbers with decimal points
  const parts = amount.split('.');
  const wholePart = parts[0] || '0';
  let fractionalPart = parts[1] || '';
  
  // Pad or truncate fractional part to match decimals
  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.substring(0, decimals);
  } else {
    while (fractionalPart.length < decimals) {
      fractionalPart += '0';
    }
  }
  
  // Remove leading zeros from whole part
  const wholePartWithoutLeadingZeros = wholePart.replace(/^0+/, '') || '0';
  
  // Combine parts without decimal point
  const combinedString = wholePartWithoutLeadingZeros + fractionalPart;
  
  // Convert to BigInt
  return BigInt(combinedString);
}

/**
 * Format a token amount from contract units to human-readable
 * @param tokenAddress The token address
 * @param amountBigInt The amount as a BigInt
 * @returns The formatted amount as a string
 */
export function formatTokenUnits(tokenAddress: Address, amountBigInt: bigint): string {
  const decimals = getTokenDecimals(tokenAddress);
  
  // Convert to string and pad with leading zeros if needed
  let amountStr = amountBigInt.toString();
  while (amountStr.length <= decimals) {
    amountStr = '0' + amountStr;
  }
  
  // Split into whole and fractional parts
  const wholePart = amountStr.slice(0, -decimals) || '0';
  const fractionalPart = amountStr.slice(-decimals);
  
  // Format with decimal point
  return `${wholePart}.${fractionalPart}`;
}