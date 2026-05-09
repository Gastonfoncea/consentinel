"use client";

import { useEffect, useState } from "react";

export interface WalletTx {
  hash: string;
  direction: "in" | "out";
  counterparty: string;
  amount: string;
  blockNumber: number;
  basescanUrl: string | null;
}

export interface WalletStateConfigured {
  configured: true;
  address: string;
  addressUrl: string;
  balance: string;
  currency: "USDC";
  blockNumber: number;
  txs: WalletTx[];
}

export interface WalletStateUnconfigured {
  configured: false;
  reason: string;
}

export type WalletState = WalletStateConfigured | WalletStateUnconfigured;

const POLL_INTERVAL_MS = 2000;

export function useWallet(): {
  state: WalletState | null;
  loading: boolean;
} {
  const [state, setState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as WalletState;
          setState(data);
        }
      } catch {
        /* swallow transient network errors */
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { state, loading };
}
