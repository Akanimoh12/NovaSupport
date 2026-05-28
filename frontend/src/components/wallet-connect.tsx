"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAvailableWallets,
  getWalletAdapter,
  type WalletAdapter,
  type WalletId,
} from "@/lib/wallet-adapters";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

const STORAGE_KEY = "walletAddress";
const STORAGE_WALLET_ID = "walletId";

type WalletConnectProps = {
  onConnect?: (address: string) => void;
};

export function WalletConnect({ onConnect }: WalletConnectProps = {}) {
  const [address, setAddress] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<WalletId | null>(null);
  const [available, setAvailable] = useState<WalletAdapter[]>([]);
  const [status, setStatus] = useState("Choose a wallet to connect.");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Detect available wallets client-side only
  useEffect(() => {
    setAvailable(getAvailableWallets());
  }, []);

  // Restore persisted session
  useEffect(() => {
    const savedAddress = localStorage.getItem(STORAGE_KEY);
    const savedWalletId = localStorage.getItem(STORAGE_WALLET_ID) as WalletId | null;
    if (savedAddress && savedWalletId) {
      setAddress(savedAddress);
      setActiveWallet(savedWalletId);
      setStatus(`${savedWalletId.charAt(0).toUpperCase() + savedWalletId.slice(1)} connected.`);
      onConnect?.(savedAddress);
    }
  }, [onConnect]);

  const connectWallet = useCallback(async (walletId: WalletId) => {
    const adapter = getWalletAdapter(walletId);
    if (!adapter) return;

    setConnecting(true);
    setError(null);
    setStatus(`Connecting to ${adapter.name}…`);

    try {
      const pubkey = await adapter.connect();
      localStorage.setItem(STORAGE_KEY, pubkey);
      localStorage.setItem(STORAGE_WALLET_ID, walletId);
      setAddress(pubkey);
      setActiveWallet(walletId);
      setStatus(`${adapter.name} connected on Stellar Testnet.`);
      onConnect?.(pubkey);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${adapter.name}.`);
      setStatus("Connection failed.");
    } finally {
      setConnecting(false);
    }
  }, [onConnect]);

  function disconnectWallet() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_WALLET_ID);
    setAddress(null);
    setActiveWallet(null);
    setError(null);
    setStatus("Choose a wallet to connect.");
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-mint">Wallet</p>
          <div className="mt-2 text-sm text-sky/80">
            {error ? <p className="text-red-400">{error}</p> : <p>{status}</p>}
          </div>
        </div>
        {address && (
          <button
            type="button"
            onClick={disconnectWallet}
            className="rounded-full bg-mint px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Wallet selector — shown when not connected */}
      {!address && (
        <div className="mt-4 flex flex-wrap gap-2">
          {available.length === 0 ? (
            <p className="text-sm text-sky/60">
              No Stellar wallets detected.{" "}
              <a
                href="https://freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mint underline decoration-mint/30 underline-offset-4 hover:decoration-mint"
              >
                Install Freighter
              </a>
            </p>
          ) : (
            available.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                disabled={connecting}
                onClick={() => connectWallet(wallet.id)}
                className="rounded-full border border-mint/40 px-4 py-2 text-sm font-semibold text-mint transition hover:bg-mint hover:text-ink disabled:opacity-50"
              >
                {connecting && activeWallet === wallet.id
                  ? "Connecting…"
                  : `Connect ${wallet.name}`}
              </button>
            ))
          )}
        </div>
      )}

      {address && (
        <div className="mt-4 rounded-2xl border border-mint/30 bg-ink/50 p-3 text-sm text-white">
          Connected address:{" "}
          <span className="font-semibold">{truncateAddress(address)}</span>
        </div>
      )}
    </div>
  );
}
