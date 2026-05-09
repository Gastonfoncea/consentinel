import type { KernelStreamEvent } from "./types";

type Step = Omit<KernelStreamEvent, "ts"> & { delayBefore?: number };

const SCENARIOS: Step[][] = [
  [
    {
      type: "request",
      requestId: "req_demo_aligned_transfer",
      agentId: "finance_agent",
      action: "pay",
      service: "wallet",
      intent: "Send 20 USDC to Juan for dinner.",
    },
    { type: "thinking", requestId: "req_demo_aligned_transfer", message: "matching against behavior graph…", delayBefore: 350 },
    { type: "evidence", requestId: "req_demo_aligned_transfer", label: "graph", detail: "3 prior pays to 0x9f2c…juan in last 7d", delayBefore: 400 },
    { type: "evidence", requestId: "req_demo_aligned_transfer", label: "vectors", detail: "top precedent similarity 0.94", delayBefore: 250 },
    {
      type: "decision",
      requestId: "req_demo_aligned_transfer",
      outcome: "allow",
      riskScore: 0.08,
      explanation: "Counterparty + amount match prior allows. Source is direct_user.",
      delayBefore: 300,
    },
  ],
  [
    {
      type: "request",
      requestId: "req_demo_recipient_swap",
      agentId: "finance_agent",
      action: "pay",
      service: "wallet",
      intent: "Send 20 USDC to wallet from latest email thread.",
      delayBefore: 1200,
    },
    { type: "thinking", requestId: "req_demo_recipient_swap", message: "context source = email · sourceTrust = untrusted", delayBefore: 350 },
    { type: "evidence", requestId: "req_demo_recipient_swap", label: "graph", detail: "counterparty 0x4a8b…evil never seen", delayBefore: 400 },
    { type: "evidence", requestId: "req_demo_recipient_swap", label: "vectors", detail: "no precedent for this recipient", delayBefore: 250 },
    {
      type: "decision",
      requestId: "req_demo_recipient_swap",
      outcome: "deny",
      riskScore: 0.92,
      explanation: "Recipient swap detected via untrusted email context. Original user ask had different counterparty.",
      delayBefore: 300,
    },
  ],
  [
    {
      type: "request",
      requestId: "req_demo_amount_spike",
      agentId: "finance_agent",
      action: "pay",
      service: "wallet",
      intent: "Send 350 USDC to Juan after follow-up changed total.",
      delayBefore: 1200,
    },
    { type: "thinking", requestId: "req_demo_amount_spike", message: "amount deviates 17.5x from expected 20 USDC", delayBefore: 350 },
    { type: "evidence", requestId: "req_demo_amount_spike", label: "graph", detail: "max prior spend to this counterparty: 20 USDC", delayBefore: 400 },
    { type: "evidence", requestId: "req_demo_amount_spike", label: "policy", detail: "exceeds maxAutonomousSpend=75 USD", delayBefore: 250 },
    {
      type: "decision",
      requestId: "req_demo_amount_spike",
      outcome: "step_up",
      riskScore: 0.71,
      explanation: "High amount + irreversible + mixed-trust context. Voice biometric required.",
      delayBefore: 300,
    },
    {
      type: "step_up",
      requestId: "req_demo_amount_spike",
      channel: "voice_biometric_callback",
      prompt: "Confirm sending 350 USDC to 0x9f2c…juan?",
      delayBefore: 400,
    },
  ],
];

const PAUSE_BETWEEN_SCENARIOS = 1800;

export async function* kernelEventStream(signal?: AbortSignal): AsyncGenerator<KernelStreamEvent> {
  let iteration = 0;
  while (!signal?.aborted) {
    for (const scenario of SCENARIOS) {
      for (const step of scenario) {
        if (signal?.aborted) return;
        if (step.delayBefore) {
          await sleep(step.delayBefore, signal);
        }
        const { delayBefore: _drop, ...rest } = step;
        yield { ...rest, ts: Date.now() } as KernelStreamEvent;
      }
      await sleep(PAUSE_BETWEEN_SCENARIOS, signal);
    }
    iteration += 1;
    if (iteration === 1) {
      // After first full pass, idle with periodic pings so the UI stays connected
      while (!signal?.aborted) {
        await sleep(8000, signal);
        if (signal?.aborted) return;
        yield { type: "ping", ts: Date.now() };
      }
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
