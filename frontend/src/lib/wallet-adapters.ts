/**
 * Wallet adapter pattern for Stellar wallets.
 * Provides a consistent interface across Freighter, Albedo, and Lobstr.
 */

export type WalletId = "freighter" | "albedo" | "lobstr";

export interface WalletAdapter {
  id: WalletId;
  name: string;
  /** Returns true if the wallet is available in the current browser context. */
  isAvailable(): boolean;
  /** Request access and return the public key. Throws on denial or error. */
  connect(): Promise<string>;
}

// ─── Freighter ────────────────────────────────────────────────────────────────

const freighterAdapter: WalletAdapter = {
  id: "freighter",
  name: "Freighter",
  isAvailable() {
    if (typeof window === "undefined") return false;
    // Freighter injects window.freighter
    return !!(window as any).freighter;
  },
  async connect() {
    const { getAddress, isAllowed, setAllowed } = await import(
      "@stellar/freighter-api"
    );
    const access = await isAllowed();
    if (!access.isAllowed) {
      const permission = await setAllowed();
      if (!permission.isAllowed) throw new Error("Freighter permission denied.");
    }
    const result = await getAddress();
    if (result.error) throw new Error(result.error);
    return result.address;
  },
};

// ─── Albedo ───────────────────────────────────────────────────────────────────
// Albedo injects window.albedo when its extension is installed.

const albedoAdapter: WalletAdapter = {
  id: "albedo",
  name: "Albedo",
  isAvailable() {
    if (typeof window === "undefined") return false;
    return !!(window as any).albedo;
  },
  async connect() {
    const albedo = (window as any).albedo;
    if (!albedo) throw new Error("Albedo extension not found.");
    const result = await albedo.publicKey({ require_existing: false });
    if (!result?.pubkey) throw new Error("Albedo did not return a public key.");
    return result.pubkey;
  },
};

// ─── Lobstr ───────────────────────────────────────────────────────────────────

const lobstrAdapter: WalletAdapter = {
  id: "lobstr",
  name: "Lobstr",
  isAvailable() {
    if (typeof window === "undefined") return false;
    // Lobstr Vault extension injects window.lobstr
    return !!(window as any).lobstr;
  },
  async connect() {
    const lobstr = (window as any).lobstr;
    if (!lobstr) throw new Error("Lobstr extension not found.");
    const result = await lobstr.getPublicKey();
    if (!result) throw new Error("Lobstr did not return a public key.");
    return result;
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const ALL_ADAPTERS: WalletAdapter[] = [
  freighterAdapter,
  albedoAdapter,
  lobstrAdapter,
];

/** Returns adapters whose `isAvailable()` returns true. */
export function getAvailableWallets(): WalletAdapter[] {
  return ALL_ADAPTERS.filter((a) => a.isAvailable());
}

/** Returns the adapter for a given wallet id, or undefined. */
export function getWalletAdapter(id: WalletId): WalletAdapter | undefined {
  return ALL_ADAPTERS.find((a) => a.id === id);
}
