// Hardcoded trusted recurring services for the demo. These represent
// merchants the user has authorized for autopay; the kernel lets their
// charges through without friction because they're in the behavior graph.

export interface TrustedService {
  id: string;
  name: string;
  // SVG-friendly emoji or single char glyph; we render it inside a circle.
  glyph: string;
  amountUsdc: number;
  cadence: "monthly" | "weekly" | "yearly";
  lastChargedDaysAgo: number;
  // If the next expected charge has drifted, surface the new amount.
  amountChange?: { from: number; to: number };
}

export const TRUSTED_SERVICES: TrustedService[] = [
  {
    id: "movistar",
    name: "Movistar (línea)",
    glyph: "📱",
    amountUsdc: 25,
    cadence: "monthly",
    lastChargedDaysAgo: 3
  },
  {
    id: "spotify",
    name: "Spotify Family",
    glyph: "🎵",
    amountUsdc: 5,
    cadence: "monthly",
    lastChargedDaysAgo: 12
  },
  {
    id: "netflix",
    name: "Netflix",
    glyph: "🎬",
    amountUsdc: 8,
    cadence: "monthly",
    lastChargedDaysAgo: 5
  },
  {
    id: "gym",
    name: "SmartFit Gym",
    glyph: "🏋️",
    amountUsdc: 15,
    cadence: "monthly",
    lastChargedDaysAgo: 21,
    amountChange: { from: 12, to: 15 }
  }
];
