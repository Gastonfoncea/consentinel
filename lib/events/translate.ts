import { biometricCopy, detectBiometricMethod } from "@/lib/auth/device";
import type { KernelStreamEvent } from "./types";

export type ActivityStatus =
  | "thinking"
  | "approved"
  | "blocked"
  // Single step-up status. The actual auth method (FaceID, TouchID, huella)
  // is decided client-side by detectBiometricMethod() and surfaced in
  // statusLabel/actionPrompt at translate time.
  | "needs_biometric";

export interface TechnicalLine {
  ts: number;
  kind: "request" | "thinking" | "evidence" | "decision" | "step_up";
  text: string;
}

export interface TranslatedRequest {
  requestId: string;
  startedAt: number;
  // What the assistant is trying to do, in plain language.
  headline: string;
  subline?: string;
  // Kernel narrating its reasoning, in casual first-person.
  reasoning: string[];
  status: ActivityStatus;
  statusLabel: string;
  // CTA copy for step-up scenarios.
  actionPrompt?: string;
  // Raw events translated to dev-mode lines (for the per-card expand).
  technicalLines: TechnicalLine[];
}

type RequestEvent = Extract<KernelStreamEvent, { type: "request" }>;
type DecisionEvent = Extract<KernelStreamEvent, { type: "decision" }>;

interface ScenarioCopy {
  headline: (req: RequestEvent) => string;
  subline?: (req: RequestEvent) => string | undefined;
  // One reasoning line per evidence event, in order. Lines appear
  // progressively as evidence arrives, which gives the "kernel thinking
  // out loud" feel without coupling the panel to event timing.
  evidenceCopy: string[];
}

// Hand-crafted copy for the demo scenarios — guarantees the demo reads
// perfectly. Anything outside this map falls back to the generic translator.
// All copy speaks AS the kernel ("yo, Consentinel") ABOUT the agent
// ("tu asistente"), in casual rioplatense first-person.
const SCENARIO_COPY: Record<string, ScenarioCopy> = {
  req_demo_aligned_transfer: {
    headline: () => "Tu asistente quiere mandarle 20 USDC a Juan",
    subline: () => '"for dinner"',
    evidenceCopy: [
      "Lo conozco — le mandaste 3 veces esta semana.",
      "Y me lo pediste vos directo, no vino de un mail.",
    ],
  },
  req_demo_recipient_swap: {
    headline: () => "Tu asistente quiere mandarle 20 USDC a una wallet nueva",
    subline: () => "(la pista vino de un mail que recibió)",
    evidenceCopy: [
      "Esa wallet no la vi nunca — nunca le mandaste nada.",
      "El monto coincide con lo que pediste, pero el destinatario cambió en el camino. Puede ser phishing.",
    ],
  },
  req_demo_amount_spike: {
    headline: () => "Tu asistente quiere mandarle 350 USDC a Juan",
    subline: () => "(después de un follow-up que cambió el total)",
    evidenceCopy: [
      "Algo no me cierra — a Juan le mandás 20 USDC por vez como mucho, esto es 17 veces más.",
      "Y tu política dice que no apruebo solo arriba de 75 USD.",
    ],
  },
};

export function groupByRequest(
  events: KernelStreamEvent[]
): Map<string, KernelStreamEvent[]> {
  const groups = new Map<string, KernelStreamEvent[]>();
  for (const event of events) {
    if (event.type === "ping") continue;
    const list = groups.get(event.requestId) ?? [];
    list.push(event);
    groups.set(event.requestId, list);
  }
  return groups;
}

export function translateRequest(
  events: KernelStreamEvent[]
): TranslatedRequest | null {
  const requestEvent = events.find((e) => e.type === "request") as
    | RequestEvent
    | undefined;
  if (!requestEvent) return null;

  const decisionEvent = events.find((e) => e.type === "decision") as
    | DecisionEvent
    | undefined;

  const copy = SCENARIO_COPY[requestEvent.requestId];

  const headline = copy?.headline(requestEvent) ?? genericHeadline(requestEvent);
  const subline = copy?.subline?.(requestEvent) ?? genericSubline(requestEvent);

  // One reasoning line per evidence event seen so far.
  const evidenceCount = events.filter((e) => e.type === "evidence").length;
  const reasoning: string[] = copy
    ? copy.evidenceCopy.slice(0, evidenceCount)
    : genericReasoning(events);

  let status: ActivityStatus = "thinking";
  let statusLabel = "Pensando…";
  let actionPrompt: string | undefined;

  if (decisionEvent) {
    if (
      decisionEvent.outcome === "allow" ||
      decisionEvent.outcome === "allow_with_audit"
    ) {
      status = "approved";
      statusLabel = "Aprobado";
    } else if (decisionEvent.outcome === "deny") {
      status = "blocked";
      statusLabel = "Bloqueado";
    } else if (decisionEvent.outcome === "step_up") {
      status = "needs_biometric";
      const method = detectBiometricMethod();
      const bio = biometricCopy(method);
      statusLabel = bio.status;
      actionPrompt = bio.action;
    }
  }

  const technicalLines = events
    .filter((e): e is Exclude<KernelStreamEvent, { type: "ping" }> =>
      e.type !== "ping"
    )
    .map(translateToTechLine);

  return {
    requestId: requestEvent.requestId,
    startedAt: requestEvent.ts,
    headline,
    subline,
    reasoning,
    status,
    statusLabel,
    actionPrompt,
    technicalLines,
  };
}

export function translateAll(events: KernelStreamEvent[]): TranslatedRequest[] {
  const groups = groupByRequest(events);
  const translated: TranslatedRequest[] = [];
  for (const [, group] of groups) {
    const t = translateRequest(group);
    if (t) translated.push(t);
  }
  // Newest first — the eye lands on the most recent action.
  translated.sort((a, b) => b.startedAt - a.startedAt);
  return translated;
}

// ---------- generic fallbacks ----------

function genericHeadline(req: RequestEvent): string {
  const intent = req.intent.replace(/\.$/, "");
  return `Tu asistente quiere ${intent.toLowerCase()}`;
}

function genericSubline(_req: RequestEvent): string | undefined {
  return undefined;
}

function genericReasoning(events: KernelStreamEvent[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    if (e.type === "evidence") lines.push(e.detail);
    if (e.type === "decision") lines.push(e.explanation);
  }
  return lines;
}

function translateToTechLine(
  e: Exclude<KernelStreamEvent, { type: "ping" }>
): TechnicalLine {
  switch (e.type) {
    case "request":
      return {
        ts: e.ts,
        kind: "request",
        text: `REQUEST ${e.agentId} ${e.action} ${e.service} — ${e.intent}`,
      };
    case "thinking":
      return { ts: e.ts, kind: "thinking", text: `· ${e.message}` };
    case "evidence":
      return { ts: e.ts, kind: "evidence", text: `${e.label}: ${e.detail}` };
    case "decision":
      return {
        ts: e.ts,
        kind: "decision",
        text: `${e.outcome.toUpperCase()} risk=${e.riskScore.toFixed(2)} ${e.explanation}`,
      };
    case "step_up":
      return {
        ts: e.ts,
        kind: "step_up",
        text: `STEP-UP ${e.channel} ${e.prompt}`,
      };
  }
}

export function formatRelativeTime(then: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - then);
  const s = Math.round(diff / 1000);
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h}h`;
  return new Date(then).toLocaleDateString();
}

export function formatTechLine(line: TechnicalLine): string {
  const ts = new Date(line.ts).toTimeString().slice(0, 8);
  return `[${ts}] ${line.text}`;
}
