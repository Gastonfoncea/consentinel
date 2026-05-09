import { ChatPanel } from "@/components/chat-panel";
import { LogPanel } from "@/components/log-panel";
import { PhoneMock } from "@/components/phone-mock";
import { UserMenu } from "@/components/user-menu";
import { WalletPanel } from "@/components/wallet-panel";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  const username = session.username ?? "guest";

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-allow shadow-glow-allow" />
          <span className="font-mono text-sm tracking-wide text-text">
            consentinel
          </span>
          <span className="text-xs text-muted">permission kernel</span>
        </div>
        <UserMenu username={username} />
      </header>

      <section className="grid grid-cols-1 gap-4 border-b border-border px-6 py-6 lg:grid-cols-2">
        <PhoneMock />
        <WalletPanel />
      </section>

      <section className="grid flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          <ChatPanel />
        </div>
        <div>
          <LogPanel />
        </div>
      </section>
    </main>
  );
}
