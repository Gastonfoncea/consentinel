// PLA-44 — Hardcoded trusted recurring services for the demo.
//
// These are services the user has auto-approved through Consentinel —
// the kernel sees them in the behavior graph and lets the agent pay
// them without prompting. Each entry mirrors what would otherwise be
// stored in the kernel's track-record memory:
//
//   user_alba → service_<merchant> → amount X every month
//
// `amountChanged` flags merchants whose latest invoice deviated from
// the historical average — the kernel still allows the payment (it's
// within the trust envelope) but surfaces the deviation in the UI so
// the user can review. Spotify here demonstrates that flag.

export interface TrustedService {
  id: string;
  name: string;
  // Single emoji or short string used as a "favicon" tile next to the
  // name. Kept as raw character so we don't depend on an icon set.
  icon: string;
  // Brand-ish color for the tile background (any Tailwind-compatible
  // hex or rgba). Kept loose so we can drop in real assets later
  // without rewriting the component.
  tileColor: string;
  // Monthly charge, USDC, two decimals.
  amount: string;
  // Human "last paid" label (relative or absolute, whichever reads
  // better in the tile). The demo doesn't need real timestamps.
  lastPaid: string;
  // Soft nudge for the next charge so the panel feels like a real
  // subscriptions tray.
  nextDue: string;
  // True when the latest invoice was meaningfully larger than the
  // tracked average. Renders an amber "amount changed" pill.
  amountChanged?: boolean;
  // Short merchant blurb, only shown on hover/expand if we wire that
  // later. Kept here so the data file is the single source of truth.
  merchantNote?: string;
}

export const trustedServices: TrustedService[] = [
  {
    id: "movistar",
    name: "Movistar",
    icon: "M",
    tileColor: "#0066FF",
    amount: "12.00",
    lastPaid: "hace 3 días",
    nextDue: "5 jun",
    merchantNote: "Plan móvil 8 GB"
  },
  {
    id: "spotify",
    name: "Spotify",
    icon: "♪",
    tileColor: "#1DB954",
    amount: "10.99",
    lastPaid: "ayer",
    nextDue: "9 jun",
    amountChanged: true,
    merchantNote: "Premium individual"
  },
  {
    id: "netflix",
    name: "Netflix",
    icon: "N",
    tileColor: "#E50914",
    amount: "15.00",
    lastPaid: "hace 1 semana",
    nextDue: "15 jun"
  },
  {
    id: "gym",
    name: "SmartFit",
    icon: "↑",
    tileColor: "#F1C40F",
    amount: "29.90",
    lastPaid: "hace 12 días",
    nextDue: "22 jun",
    merchantNote: "Plan mensual"
  }
];
