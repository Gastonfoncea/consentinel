"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet, type WalletTx } from "@/lib/hooks/use-wallet";
import { cn } from "@/lib/utils";

export function WalletPanel() {
  const { state, loading } = useWallet();
  const previousBalanceRef = useRef<string | null>(null);
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!state || !state.configured) return;
    const prev = previousBalanceRef.current;
    const next = state.balance;
    if (prev !== null && prev !== next) {
      const direction = parseFloat(next) > parseFloat(prev) ? "up" : "down";
      setPulse(direction);
      const t = setTimeout(() => setPulse(null), 1200);
      return () => clearTimeout(t);
    }
    previousBalanceRef.current = next;
  }, [state]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
            wallet · base sepolia
          </p>
          {state?.configured ? (
            <a
              href={state.addressUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-xs text-muted hover:text-text"
              title={state.address}
            >
              {shortAddr(state.address)} ↗
            </a>
          ) : (
            <p className="font-mono text-xs text-muted">no address</p>
          )}
        </div>
        {state?.configured && (
          <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
            block #{state.blockNumber.toLocaleString()}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        {state?.configured ? (
          <>
            <AnimatePresence mode="wait">
              <motion.span
                key={state.balance}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 6, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={cn(
                  "font-mono text-3xl tabular-nums",
                  pulse === "up" && "text-allow drop-shadow-[0_0_12px_rgba(0,255,136,0.55)]",
                  pulse === "down" && "text-deny drop-shadow-[0_0_12px_rgba(255,59,48,0.55)]",
                  !pulse && "text-text"
                )}
              >
                {formatBalance(state.balance)}
              </motion.span>
            </AnimatePresence>
            <span className="font-mono text-sm text-muted">USDC</span>
          </>
        ) : (
          <span className="font-mono text-2xl text-muted">—</span>
        )}
      </div>

      {!state && loading && (
        <p className="mt-2 font-mono text-xs text-muted">loading wallet…</p>
      )}

      {state && !state.configured && (
        <p className="mt-2 font-mono text-xs text-muted">
          wallet not configured — set WALLET_PRIVATE_KEY + USDC_CONTRACT in env
        </p>
      )}

      <div className="mt-5">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          recent transactions
        </p>
        <div className="max-h-28 overflow-y-auto pr-1">
          {state?.configured && state.txs.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              <AnimatePresence initial={false}>
                {state.txs.map((tx) => (
                  <motion.li
                    key={tx.hash}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <TxRow tx={tx} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : state?.configured ? (
            <p className="font-mono text-xs text-muted">no recent activity</p>
          ) : (
            <p className="font-mono text-xs text-muted">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx }: { tx: WalletTx }) {
  const isOut = tx.direction === "out";
  return (
    <a
      href={tx.basescanUrl ?? "#"}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 font-mono text-xs transition hover:border-border hover:bg-bg"
    >
      <span className="flex items-center gap-2">
        <span className={cn("text-[10px]", isOut ? "text-deny" : "text-allow")}>
          {isOut ? "→" : "←"}
        </span>
        <span className="text-muted">{shortAddr(tx.counterparty)}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className={cn("tabular-nums", isOut ? "text-deny" : "text-allow")}>
          {isOut ? "−" : "+"}
          {tx.amount}
        </span>
        <span className="text-muted">{shortHash(tx.hash)} ↗</span>
      </span>
    </a>
  );
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatBalance(balance: string): string {
  const n = parseFloat(balance);
  if (Number.isNaN(n)) return balance;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
