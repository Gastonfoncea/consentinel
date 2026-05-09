// Hardcoded incoming charges feed for the demo. Each entry shows what the
// kernel decided when a third-party tried to charge the wallet. Mix of
// outcomes (allow_with_audit, step_up_pending, deny) to make the narrative
// "kernel intervenes on anomalies, not on routine" tangible.

export type IncomingDecision =
  | "allow_with_audit"
  | "step_up_pending"
  | "step_up_resolved_allow"
  | "step_up_resolved_deny"
  | "deny";

export interface IncomingCharge {
  id: string;
  merchant: string;
  glyph: string;
  amountUsdc: number;
  hoursAgo: number;
  decision: IncomingDecision;
  /** Short reason surfaced under the row when relevant. */
  rationale?: string;
}

export const INCOMING_CHARGES: IncomingCharge[] = [
  {
    id: "ch_004",
    merchant: "Coursera",
    glyph: "📚",
    amountUsdc: 49,
    hoursAgo: 2,
    decision: "step_up_pending",
    rationale: "First-time merchant. Awaiting your verification."
  },
  {
    id: "ch_003",
    merchant: "Unknown sender · 0xBaD0…Bad42",
    glyph: "⚠️",
    amountUsdc: 350,
    hoursAgo: 3,
    decision: "deny",
    rationale: "Counterparty never seen + intent drift detected from email."
  },
  {
    id: "ch_002",
    merchant: "Uber Eats",
    glyph: "🍔",
    amountUsdc: 12,
    hoursAgo: 8,
    decision: "allow_with_audit",
    rationale: "Within typical daily food spend."
  },
  {
    id: "ch_001",
    merchant: "Movistar (línea)",
    glyph: "📱",
    amountUsdc: 25,
    hoursAgo: 72,
    decision: "allow_with_audit",
    rationale: "Trusted recurring — autopay."
  }
];
