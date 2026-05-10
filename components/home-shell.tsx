"use client";

import { useCallback, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { ChatPanel } from "@/components/chat-panel";
import { DevScenarioLauncher } from "@/components/dev-scenario-launcher";
import { NotificationPermissionBanner } from "@/components/notification-permission-banner";
import { PresenceBlob, type BlobState } from "@/components/presence-blob";
import { PushToast } from "@/components/push-toast";
import { UserMenu } from "@/components/user-menu";
import { VoiceSession } from "@/components/voice-session";
import { WalletPanel } from "@/components/wallet-panel";
import { WalletPendingAction } from "@/components/wallet-pending-action";
import { useBlobState } from "@/lib/hooks/use-blob-state";
import { useDesktopNotification } from "@/lib/hooks/use-desktop-notification";
import { usePushSubscription } from "@/lib/hooks/use-push-subscription";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface HomeShellProps {
  username: string;
}

// Preview cycle: "live" plays whatever the kernel event stream emits.
// Every other entry forces the blob into that state so we can demo the UI
// without triggering real requests. Click the button to advance.
type PreviewMode = "live" | BlobState;
const PREVIEW_CYCLE: PreviewMode[] = [
  "live",
  "idle",
  "thinking",
  "verifying",
  "allow",
  "deny",
];

export function HomeShell({ username }: HomeShellProps) {
  const { state: liveState, pulseSeed } = useBlobState();
  const [previewMode, setPreviewMode] = useState<PreviewMode>("live");

  // Shared handler for both surfaces (in-app toast + OS notification).
  // PLA-38 will swap this for the verification modal trigger.
  const handleStepUpOpen = useCallback((requestId: string) => {
    // eslint-disable-next-line no-console
    console.log("[step-up] open requested", requestId);
  }, []);

  const { permission: notifPermission, requestPermission: requestNotifPermission } =
    useDesktopNotification({ onOpen: handleStepUpOpen });

  // Once the user accepts OS notifications, also register the service
  // worker and subscribe to Web Push so the kernel can reach the device
  // when the browser is closed (PWA on iOS, idle Chrome on desktop, etc.).
  // The hook is no-op on unsupported browsers and idempotent on repeats.
  const { subscribe: subscribePush } = usePushSubscription();
  useEffect(() => {
    if (notifPermission === "granted") {
      void subscribePush();
    }
  }, [notifPermission, subscribePush]);

  const isPreview = previewMode !== "live";
  const blobState: BlobState = isPreview ? previewMode : liveState;

  // Preview only overrides STATE, never pulseSeed. Pulses (evidence
  // ripples + decision flashes) come from real stream events. Bumping
  // a seed on every click was punching the blob with a transient
  // displacement spike, which read as the blob "going crazy".
  const cyclePreview = () => {
    setPreviewMode((prev) => {
      const i = PREVIEW_CYCLE.indexOf(prev);
      return PREVIEW_CYCLE[(i + 1) % PREVIEW_CYCLE.length];
    });
  };

  return (
    // h-screen + overflow-hidden on lg locks the dashboard to the viewport so
    // only the activity feed scrolls. Mobile keeps natural page scroll
    // (min-h-screen) since stacking blob + panels vertically needs room.
    <main className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <NotificationPermissionBanner
        permission={notifPermission}
        onRequest={requestNotifPermission}
      />

      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full transition-colors",
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
          <span className="hidden text-xs text-muted sm:inline">
            <span className="text-text">{username}</span>
            <span className="mx-2 text-muted/50">⇄</span>
            <span className="text-muted">myagent</span>
          </span>
        </div>
        <UserMenu username={username} />
      </header>

      <section className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* Left column: blob hero + supporting cards. 9:11 ratio against the
            activity panel = 45/55. Blob still reads as hero (the radial halo
            extends its presence past the rectangle); feed gets room to breathe. */}
        <div className="flex flex-col lg:min-h-0 lg:flex-[9]">
          <div
            className="relative min-h-[420px] flex-1 overflow-hidden lg:min-h-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 55% 45% at 50% 42%, rgba(103, 184, 216, 0.10), transparent 70%)",
            }}
          >
            <PresenceBlob state={blobState} pulseSeed={pulseSeed} />
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted/70">
                state · {blobState}
                {isPreview && (
                  <span className="ml-2 text-stepup/80">· preview</span>
                )}
              </p>
            </div>
            {process.env.NODE_ENV === "development" && (
              <button
                type="button"
                onClick={cyclePreview}
                className={cn(
                  "absolute bottom-4 right-4 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] backdrop-blur transition",
                  isPreview
                    ? "border-stepup/40 bg-stepup/10 text-stepup hover:bg-stepup/20"
                    : "border-border bg-background/70 text-muted/80 hover:bg-background hover:text-text"
                )}
                aria-label="Cycle blob preview state"
              >
                {previewMode === "live" ? "preview ▶" : `${previewMode} ↻`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2">
            <WalletPendingAction onStepUpClick={handleStepUpOpen} />
            <WalletPanel />
          </div>
          {/* Optional chat slot — kept hidden by default, reveal when ready */}
          <div className="hidden">
            <ChatPanel />
          </div>
        </div>

        {/* Right column: human-readable activity feed. min-h-0 lets the
            panel's internal overflow-y-auto actually clip + scroll on lg. */}
        <div className="border-t border-border lg:min-h-0 lg:flex-[11] lg:border-l lg:border-t-0">
          <ActivityPanel />
        </div>
      </section>

      <PushToast onOpen={handleStepUpOpen} />

      {process.env.NODE_ENV === "development" && <DevScenarioLauncher />}
      <VoiceSession />
    </main>
  );
}
