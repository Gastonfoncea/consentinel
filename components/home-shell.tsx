"use client";

import { ChatPanel } from "@/components/chat-panel";
import { LogPanel } from "@/components/log-panel";
import { PhoneMock } from "@/components/phone-mock";
import { PresenceBlob } from "@/components/presence-blob";
import { UserMenu } from "@/components/user-menu";
import { WalletPanel } from "@/components/wallet-panel";
import { useBlobState } from "@/lib/hooks/use-blob-state";
import { cn } from "@/lib/utils";

interface HomeShellProps {
  username: string;
}

export function HomeShell({ username }: HomeShellProps) {
  const blobState = useBlobState();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              blobState === "deny"
                ? "bg-deny shadow-glow-deny"
                : blobState === "verifying"
                ? "bg-stepup shadow-glow-stepup"
                : "bg-allow shadow-glow-allow"
            )}
          />
          <span className="font-mono text-sm tracking-wide text-text">
            consentinel
          </span>
          <span className="text-xs text-muted">
            <span className="text-text">{username}</span>
            <span className="mx-2 text-muted/50">⇄</span>
            <span className="text-muted">myagent</span>
          </span>
        </div>
        <UserMenu username={username} />
      </header>

      <section className="grid flex-1 grid-cols-1 lg:grid-cols-[3fr_2fr]">
        {/* Left column: blob hero + supporting cards */}
        <div className="flex flex-col">
          <div className="relative min-h-[420px] flex-1 overflow-hidden">
            <PresenceBlob state={blobState} />
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted/70">
                state · {blobState}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2">
            <PhoneMock />
            <WalletPanel />
          </div>
          {/* Optional chat slot — kept hidden by default, reveal when ready */}
          <div className="hidden">
            <ChatPanel />
          </div>
        </div>

        {/* Right column: live kernel log */}
        <div className="border-t border-border lg:border-l lg:border-t-0">
          <LogPanel />
        </div>
      </section>
    </main>
  );
}
