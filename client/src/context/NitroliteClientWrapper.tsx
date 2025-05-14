"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { NitroliteClient, type ContractAddresses } from "@erc7824/nitrolite";

import { ethers } from "ethers";
import { generateKeyPair } from "./createSigner";
import { polygon } from "viem/chains";
import APP_CONFIG from "./app";
import { useMetaMask } from "../hooks/useMetaMask";

const CRYPTO_KEYPAIR_KEY = "crypto_keypair";

export const CHAINS = polygon;

// Create context for the Nitrolite client
interface NitroliteContextType {
    client: NitroliteClient | null;
    loading: boolean;
    error: string | null;
}

const NitroliteContext = createContext<NitroliteContextType>({
    client: null,
    loading: true,
    error: null,
});

// Hook for components to use the Nitrolite client
export const useNitrolite = () => useContext(NitroliteContext);

interface NitroliteClientWrapperProps {
    children?: React.ReactNode;
}

export function NitroliteClientWrapper({ children }: NitroliteClientWrapperProps) {
    const [clientState, setClientState] = useState<NitroliteContextType>({
        client: null,
        loading: true,
        error: null,
    });

    // Use MetaMask hook for wallet connection
    const { provider, address, isConnected } = useMetaMask();

    const initializeKeys = useCallback(async (): Promise<{ keyPair: unknown; stateWalletClient: unknown }> => {
        try {
            let keyPair = null;
            const savedKeys = localStorage.getItem(CRYPTO_KEYPAIR_KEY);

            if (savedKeys) {
                try {
                    keyPair = JSON.parse(savedKeys);
                } catch (error) {
                    keyPair = null;
                    console.error("Failed to parse saved keys:", error);
                }
            }

            if (!keyPair) {
                keyPair = await generateKeyPair();
                if (typeof window !== "undefined") {
                    localStorage.setItem(CRYPTO_KEYPAIR_KEY, JSON.stringify(keyPair));
                }
            }

            const wallet = new ethers.Wallet(keyPair.privateKey);

            const stateWalletClient = {
                ...wallet,
                account: {
                    address: wallet.address,
                },
                signMessage: async ({ message: { raw } }: { message: { raw: string } }) => {
                    const messageBytes = typeof raw === "string" && raw.startsWith("0x") ? ethers.getBytes(raw) : raw;

                    // Sign the digest directly
                    const signature = await wallet.signMessage(messageBytes);

                    return signature as Hex;
                },
            };

            return { keyPair, stateWalletClient };
        } catch (error) {
            console.error("Failed to initialize keys:", error);
            return { keyPair: null, stateWalletClient: null };
        }
    }, []);

    useEffect(() => {
        const initializeNitrolite = async () => {
            try {
                setClientState((prev) => ({ ...prev, loading: true, error: null }));

                // Only proceed if MetaMask is connected
                if (!isConnected || !provider || !address) {
                    setClientState((prev) => ({
                        ...prev,
                        loading: false,
                        error: "MetaMask not connected. Please connect your wallet.",
                    }));
                    return;
                }

                const keyInitResult = await initializeKeys();

                if (!keyInitResult || !keyInitResult.stateWalletClient) {
                    throw new Error("Failed to initialize state wallet client keys.");
                }
                const { stateWalletClient } = keyInitResult;

                const publicClient = createPublicClient({
                    transport: http(),
                    chain: polygon,
                });

                // Use MetaMask provider for the walletClient
                const walletClient = createWalletClient({
                    // @ts-ignore
                    transport: custom(provider.provider),
                    chain: polygon,
                    account: address as Hex,
                });

                const addresses: ContractAddresses = {
                    custody: APP_CONFIG.CUSTODIES[polygon.id],
                    adjudicator: APP_CONFIG.ADJUDICATORS[polygon.id],
                    guestAddress: APP_CONFIG.CHANNEL.DEFAULT_GUEST as Hex,
                    tokenAddress: APP_CONFIG.TOKENS[polygon.id] as Hex,
                };

                const challengeDuration = APP_CONFIG.CHANNEL.CHALLENGE_PERIOD;

                const client = new NitroliteClient({
                    publicClient,
                    walletClient,
                    // @ts-ignore
                    stateWalletClient: stateWalletClient,
                    account: walletClient.account,
                    chainId: polygon.id,
                    challengeDuration: challengeDuration,
                    addresses,
                });

                console.log("Nitrolite client initialized successfully!");

                setClientState({
                    client,
                    loading: false,
                    error: null,
                });
            } catch (error: unknown) {
                console.error("Failed to initialize Nitrolite client:", error);
                setClientState({
                    client: null,
                    loading: false,
                    error: "Failed to initialize Nitrolite client",
                });
            }
        };

        initializeNitrolite();
    }, [initializeKeys, provider, address, isConnected]);

    // Provide the client through context
    return <NitroliteContext.Provider value={clientState}>{children}</NitroliteContext.Provider>;
}
