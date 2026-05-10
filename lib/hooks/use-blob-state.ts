"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlobState } from "@/components/presence-blob";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import type { StepUpChallengeView } from "@/lib/step-up/challenge-view";

// Minimum time a "decisive" state (allow / deny / verifying) holds before
// lower-priority events can demote it. Catches the kernel's burst of events
// per request that would otherwise flicker the blob.
const MIN_HOLD_MS = 2500;
// Minimum time "thinking" stays visible. The kernel emits an entire
// request lifecycle (request_started → trace*N → decision_made → wallet.*)
// in <100ms wallclock, so without this floor the blob never actually shows
// "thinking" — color barely starts lerping toward purple before it reverses
// toward green/red. With 800ms, the user reads "agent is reasoning" before
// seeing the outcome, even when the real evaluation took 30ms.
const MIN_THINKING_MS = 800;
// "allow" auto-decays a beat after the hold so the green reads cleanly
// before fading to idle. Total visible "allow" lifetime ≈ this value.
const ALLOW_DECAY_MS = MIN_HOLD_MS + 700;
// "deny" / errors stay longer so the user has time to clock the failure.
// Layout has no modal to dismiss against, so we lean on a generous hold
// rather than sticky-until-acknowledge. acknowledge() is still exposed
// below for future use (real modals, click-to-dismiss, etc.).
const DENY_DECAY_MS = 5000;

// Higher number = stronger state. Used both for blocking demotions during
// MIN_HOLD_MS and for picking the "best" pending target when several
// transitions queue up during MIN_THINKING_MS.
const PRIORITY: Record<BlobState, number> = {
  idle: 0,
  thinking: 1,
  verifying: 2,
  allow: 3,
  deny: 4,
};

interface BlobSignal {
  state: BlobState;
  /**
   * Monotonic counter that bumps when the blob should flash a transient
   * pulse. Now fires only on `step_up.verified` — kernel trace events used
   * to bump this on every reasoning step, but at <100ms cadence per
   * request the constant kicks read as visual chaos. The activity panel
   * still shows trace lines for "thinking out loud" feedback.
   */
  pulseSeed: number;
  /**
   * Force-clears a terminal state (allow / deny) back to idle. Exposed for
   * future "I saw it" interactions — modal dismiss, click outside, blob
   * tap. Currently unwired since the layout has no obvious dismiss target;
   * deny instead leans on DENY_DECAY_MS for visibility.
   */
  acknowledge: () => void;
}

/**
 * Derives the blob's visual state from the kernel event stream.
 *
 * Two flicker-control mechanisms run together:
 *
 *   1. MIN_THINKING_MS — when entering "thinking", defer any onward
 *      transition for ~800ms. Kernel emits a full request lifecycle in
 *      <100ms, so without this the blob shows thinking for ~50ms (invisible)
 *      before snapping to allow/deny. The strongest deferred target wins.
 *
 *   2. MIN_HOLD_MS — once in a decisive state (verifying/allow/deny),
 *      lower-priority events are dropped for 2.5s. Stops the
 *      decision_made(allow) → transfer_prepared(thinking) → transfer_executed(allow)
 *      flicker.
 *
 * Mapping:
 *   permission.request_started        → "thinking"
 *   permission.trace_event            → "thinking"  (no pulse — was visual noise)
 *   permission.decision_made:
 *     allow / allow_with_audit        → "allow"     (held, then idle)
 *     deny                            → "deny"      (held longer, then idle)
 *     step_up                         → "verifying"
 *   step_up.challenge_created         → "verifying"
 *   step_up.verified                  → "thinking"  (+ ripple pulse)
 *   wallet.transfer_prepared          → "thinking"
 *   wallet.transfer_mock_executed     → "allow"
 *   runtime.error                     → "deny"
 *   silence / ping                    → "idle"
 */
interface UseBlobStateOptions {
  // When the dashboard is bootstrapped from a Kapso WhatsApp deeplink, the
  // step-up challenge already exists in kernel state but the SSE buffer
  // for this client is empty (cold connect). Seed the blob into "verifying"
  // immediately so it doesn't sit "idle" while VoiceSession wakes Melisa.
  bootstrapChallenge?: StepUpChallengeView;
}

export function useBlobState(options: UseBlobStateOptions = {}): BlobSignal {
  const { bootstrapChallenge } = options;
  const { events } = useEventStream();
  // Seed: terminal challenges (completed/rejected/expired) don't override
  // idle — the user already finished or it's stale. Active challenges
  // start the blob in "verifying" so the deeplink lands cinematically.
  const initialState: BlobState =
    bootstrapChallenge && !bootstrapChallenge.isTerminal ? "verifying" : "idle";
  const [state, setState] = useState<BlobState>(initialState);
  const [pulseSeed, setPulseSeed] = useState(0);
  const lastEventIndexRef = useRef(-1);
  // Mirror of `state` readable synchronously inside the events effect, so
  // we evaluate priority/min-hold against the current value without the
  // stale-closure dance of putting `state` in the dep array.
  const stateRef = useRef<BlobState>(initialState);
  const stateEnteredAtRef = useRef(initialState === "idle" ? 0 : Date.now());
  // Strongest deferred target seen during MIN_THINKING_MS, applied on
  // flush. Null when nothing is pending.
  const pendingNextRef = useRef<BlobState | null>(null);

  const acknowledge = useCallback(() => {
    if (stateRef.current === "allow" || stateRef.current === "deny") {
      stateRef.current = "idle";
      stateEnteredAtRef.current = Date.now();
      pendingNextRef.current = null;
      setState("idle");
    }
  }, []);

  useEffect(() => {
    const latest = events[events.length - 1];
    const latestIndex = events.length - 1;
    if (!latest || latest.type === "ping") return;

    const isNewEvent = latestIndex !== lastEventIndexRef.current;
    lastEventIndexRef.current = latestIndex;
    if (!isNewEvent) return;

    let next: BlobState = "idle";
    switch (latest.type) {
      case "permission.request_started":
      case "permission.trace_event":
      case "step_up.verified":
      case "wallet.transfer_prepared":
        next = "thinking";
        break;
      case "permission.decision_made":
        if (latest.outcome === "step_up") next = "verifying";
        else if (latest.outcome === "deny") next = "deny";
        else next = "allow";
        break;
      case "step_up.challenge_created":
        next = "verifying";
        break;
      case "wallet.transfer_mock_executed":
        next = "allow";
        break;
      case "runtime.error":
        next = "deny";
        break;
    }

    const current = stateRef.current;
    const elapsed = Date.now() - stateEnteredAtRef.current;

    if (next === current) {
      // Same-state event — don't disturb a pending stronger target.
    } else if (current === "thinking" && elapsed < MIN_THINKING_MS) {
      // Inside the thinking floor: defer the transition. Keep the
      // strongest pending target so a brief flash-decision doesn't lose
      // out to a follow-up demotion event arriving in the same burst.
      const pending = pendingNextRef.current;
      if (!pending || PRIORITY[next] > PRIORITY[pending]) {
        pendingNextRef.current = next;
      }
    } else {
      const isPromotion = PRIORITY[next] >= PRIORITY[current];
      const minHoldDone = elapsed >= MIN_HOLD_MS;
      // Decisive states block demotions until MIN_HOLD_MS elapses; equal
      // or higher always passes immediately.
      if (isPromotion || minHoldDone) {
        pendingNextRef.current = null;
        stateRef.current = next;
        stateEnteredAtRef.current = Date.now();
        setState(next);
      }
    }

    // Pulse only on user verification — represents a real moment, not
    // background chatter. trace_event used to pulse here too but at the
    // kernel's emission rate it overwhelmed the blob.
    if (latest.type === "step_up.verified") {
      setPulseSeed((s) => s + 1);
    }
  }, [events]);

  // Flush deferred target once the thinking floor elapses. Re-runs on
  // state changes (so it always reflects the current entry time).
  useEffect(() => {
    if (state !== "thinking") return;
    const elapsed = Date.now() - stateEnteredAtRef.current;
    const remaining = Math.max(0, MIN_THINKING_MS - elapsed);
    const t = setTimeout(() => {
      const pending = pendingNextRef.current;
      if (pending && pending !== stateRef.current) {
        pendingNextRef.current = null;
        stateRef.current = pending;
        stateEnteredAtRef.current = Date.now();
        setState(pending);
      }
    }, remaining);
    return () => clearTimeout(t);
  }, [state]);

  // Auto-decay terminal states (allow / deny) → idle. Depends only on
  // `state` (not `events`), so a flurry of events that all map to the
  // same terminal state doesn't reset or cancel the timer — only a real
  // transition away from it does. deny gets a longer hold so errors stay
  // legible.
  useEffect(() => {
    if (state !== "allow" && state !== "deny") return;
    const decayMs = state === "deny" ? DENY_DECAY_MS : ALLOW_DECAY_MS;
    const t = setTimeout(() => {
      if (stateRef.current === state) {
        stateRef.current = "idle";
        stateEnteredAtRef.current = Date.now();
        setState("idle");
      }
    }, decayMs);
    return () => clearTimeout(t);
  }, [state]);

  return { state, pulseSeed, acknowledge };
}
