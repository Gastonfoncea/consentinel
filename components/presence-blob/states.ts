import * as THREE from "three";

export type BlobState = "idle" | "thinking" | "verifying" | "allow" | "deny";

export interface BlobStateParams {
  intensity: number;
  speed: number;
  displacement: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  glowColor: THREE.Color;
  glowIntensity: number;
}

const c = (hex: string) => new THREE.Color(hex);

export const STATE_PARAMS: Record<BlobState, BlobStateParams> = {
  // Default — soft tech-cyan, breathing slow. The "everything is fine" state.
  idle: {
    intensity: 0.45,
    speed: 0.32,
    displacement: 0.28,
    colorA: c("#7DD3FC"),
    colorB: c("#A5F3FC"),
    glowColor: c("#67E8F9"),
    glowIntensity: 0.65,
  },
  // Kernel is reasoning about a request — color shifts toward purple/blue, faster motion
  thinking: {
    intensity: 0.7,
    speed: 0.7,
    displacement: 0.32,
    colorA: c("#3B82F6"),
    colorB: c("#9333EA"),
    glowColor: c("#60A5FA"),
    glowIntensity: 0.95,
  },
  // Voice/passkey verification in progress — strong blue, urgent feel
  verifying: {
    intensity: 0.9,
    speed: 1.05,
    displacement: 0.36,
    colorA: c("#3B82F6"),
    colorB: c("#06B6D4"),
    glowColor: c("#3B82F6"),
    glowIntensity: 1.3,
  },
  // Action allowed — green pulse, expansive
  allow: {
    intensity: 1.05,
    speed: 1.25,
    displacement: 0.42,
    colorA: c("#00FF88"),
    colorB: c("#7DD3FC"),
    glowColor: c("#00FF88"),
    glowIntensity: 1.5,
  },
  // Action denied — red, contracted, low motion
  deny: {
    intensity: 1.0,
    speed: 0.18,
    displacement: 0.16,
    colorA: c("#FF3B30"),
    colorB: c("#1F1F1F"),
    glowColor: c("#FF3B30"),
    glowIntensity: 1.05,
  },
};
