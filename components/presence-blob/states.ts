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
  // Rotation (rad/sec) on Y axis. Idle is near-zero so the surface noise reads,
  // not the spin. State changes drive perceptible rotation differences.
  rotationSpeed: number;
  // Multiplier on the floating drift amplitude. 0 = frozen in place (deny),
  // 1 = baseline gentle float, >1 = restless.
  driftAmount: number;
  // Periodic pulse rate in Hz. 0 disables the heartbeat. Used to give
  // `verifying` a distinct waiting-on-user rhythm.
  pulseRate: number;
}

const c = (hex: string) => new THREE.Color(hex);

export const STATE_PARAMS: Record<BlobState, BlobStateParams> = {
  // Default — quiet but alive. Big slow waves (same amplitude as active
  // states) at a contemplative speed. Low glow so `thinking` still reads
  // as "woke up" rather than just "turned the volume up".
  idle: {
    intensity: 0.85,
    speed: 0.35,
    displacement: 0.42,
    colorA: c("#67B7D8"),
    colorB: c("#8FD4E0"),
    glowColor: c("#A5E8F0"),
    glowIntensity: 0.5,
    rotationSpeed: 0.05,
    driftAmount: 1.0,
    pulseRate: 0,
  },
  // Kernel is reasoning — purple/blue, faster boil, slight rotation tells
  // the user something is being processed.
  thinking: {
    intensity: 0.75,
    speed: 1.0,
    displacement: 0.38,
    colorA: c("#3B82F6"),
    colorB: c("#9333EA"),
    glowColor: c("#60A5FA"),
    glowIntensity: 0.95,
    rotationSpeed: 0.18,
    driftAmount: 1.2,
    pulseRate: 0,
  },
  // Voice/passkey verification — violet→amber with a steady ~1Hz heartbeat.
  // Drift drops to near-zero so it feels like it's *waiting* on the user
  // (locked in place, beating). Most distinct state: only one needing action.
  verifying: {
    intensity: 1.0,
    speed: 1.4,
    displacement: 0.42,
    colorA: c("#8B5CF6"),
    colorB: c("#FBBF24"),
    glowColor: c("#A78BFA"),
    glowIntensity: 1.35,
    rotationSpeed: 0.25,
    driftAmount: 0.3,
    pulseRate: 1.1,
  },
  // Action allowed — settled, expansive green. Slow speed = release of
  // tension, not extra agitation. Glow stays bright for the hold.
  allow: {
    intensity: 0.8,
    speed: 0.45,
    displacement: 0.26,
    colorA: c("#00FF88"),
    colorB: c("#7DD3FC"),
    glowColor: c("#00FF88"),
    glowIntensity: 1.4,
    rotationSpeed: 0.06,
    driftAmount: 1.0,
    pulseRate: 0,
  },
  // Action denied — frozen and contracted. No drift, no rotation. The
  // decision *flash* (handled in canvas) provides the punctuation; the
  // resting deny pose is dead-still.
  deny: {
    intensity: 0.95,
    speed: 0.22,
    displacement: 0.14,
    colorA: c("#FF3B30"),
    colorB: c("#1F1F1F"),
    glowColor: c("#FF3B30"),
    glowIntensity: 1.0,
    rotationSpeed: 0,
    driftAmount: 0,
    pulseRate: 0,
  },
};
