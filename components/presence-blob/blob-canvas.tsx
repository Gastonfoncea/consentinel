"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";
import { STATE_PARAMS, type BlobState } from "./states";

const LERP_RATE = 1.6;
// How fast a transient pulse decays back to zero (higher = snappier).
const PULSE_DECAY = 3.2;
// Camera distance from the blob. Lower = blob looks bigger. The Canvas
// `camera` prop is only read at mount, so we apply this reactively below
// via CameraRig — that's what lets HMR pick up changes without a full
// page reload while iterating.
const CAMERA_Z = 7;

function CameraRig({ z }: { z: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.z = z;
    camera.updateProjectionMatrix();
  }, [camera, z]);
  return null;
}

interface BlobProps {
  state: BlobState;
  pulseSeed: number;
}

function Blob({ state, pulseSeed }: BlobProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const targetRef = useRef(STATE_PARAMS.idle);
  const rotationSpeedRef = useRef(STATE_PARAMS.idle.rotationSpeed);
  const driftRef = useRef(STATE_PARAMS.idle.driftAmount);
  // Transient pulse envelope (0..1), decays exponentially each frame.
  const pulseRef = useRef(0);
  const lastSeedRef = useRef(pulseSeed);
  const lastStateRef = useRef<BlobState>(state);

  useEffect(() => {
    targetRef.current = STATE_PARAMS[state];
    // Decision flash: entering allow/deny punches the pulse up to ~1.0
    // for one decisive moment that then decays into the resting pose.
    if (state !== lastStateRef.current) {
      if (state === "allow" || state === "deny") {
        pulseRef.current = Math.max(pulseRef.current, 1.0);
      }
      lastStateRef.current = state;
    }
  }, [state]);

  useEffect(() => {
    if (pulseSeed !== lastSeedRef.current) {
      // Smaller bump for evidence ripples — visible but not loud.
      pulseRef.current = Math.max(pulseRef.current, 0.55);
      lastSeedRef.current = pulseSeed;
    }
  }, [pulseSeed]);

  const uniforms = useMemo(() => {
    const seed = STATE_PARAMS.idle;
    return {
      u_time: { value: 0 },
      u_intensity: { value: seed.intensity },
      u_speed: { value: seed.speed },
      u_displacement: { value: seed.displacement },
      u_colorA: { value: seed.colorA.clone() },
      u_colorB: { value: seed.colorB.clone() },
      u_glowColor: { value: seed.glowColor.clone() },
      u_glowIntensity: { value: seed.glowIntensity },
      u_pulse: { value: 0 },
    };
  }, []);

  useFrame((_, delta) => {
    const mat = materialRef.current;
    if (!mat) return;
    const u = mat.uniforms;
    const t = targetRef.current;
    const k = Math.min(delta * LERP_RATE, 1);

    u.u_time.value += delta;
    u.u_intensity.value = THREE.MathUtils.lerp(u.u_intensity.value, t.intensity, k);
    u.u_speed.value = THREE.MathUtils.lerp(u.u_speed.value, t.speed, k);
    u.u_displacement.value = THREE.MathUtils.lerp(
      u.u_displacement.value,
      t.displacement,
      k
    );
    u.u_glowIntensity.value = THREE.MathUtils.lerp(
      u.u_glowIntensity.value,
      t.glowIntensity,
      k
    );
    u.u_colorA.value.lerp(t.colorA, k);
    u.u_colorB.value.lerp(t.colorB, k);
    u.u_glowColor.value.lerp(t.glowColor, k);

    // Decay transient pulse exponentially toward 0.
    pulseRef.current *= Math.exp(-PULSE_DECAY * delta);

    // Periodic heartbeat (only verifying has pulseRate > 0). Half-rectified
    // sine so it reads as discrete beats rather than a smooth oscillation.
    let heartbeat = 0;
    if (t.pulseRate > 0) {
      const phase = u.u_time.value * t.pulseRate * Math.PI * 2;
      heartbeat = Math.max(0, Math.sin(phase)) * 0.4;
    }
    u.u_pulse.value = pulseRef.current + heartbeat;

    // Lerp rotation speed and drift amount toward state target.
    rotationSpeedRef.current = THREE.MathUtils.lerp(
      rotationSpeedRef.current,
      t.rotationSpeed,
      k
    );
    driftRef.current = THREE.MathUtils.lerp(driftRef.current, t.driftAmount, k);

    if (meshRef.current) {
      // Rotation is now state-driven. `deny` freezes the spin entirely.
      meshRef.current.rotation.y += delta * rotationSpeedRef.current;
      meshRef.current.rotation.x += delta * rotationSpeedRef.current * 0.4;

      // Floating drift, scaled by state. driftAmount=0 in `deny` pins it.
      const time = u.u_time.value;
      const d = driftRef.current;
      meshRef.current.position.x = Math.sin(time * 0.13) * 0.05 * d;
      meshRef.current.position.y = Math.cos(time * 0.1) * 0.04 * d;
      meshRef.current.position.z = Math.sin(time * 0.16) * 0.03 * d;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.25, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

export default function BlobCanvas({ state, pulseSeed }: BlobProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, CAMERA_Z], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <CameraRig z={CAMERA_Z} />
      <ambientLight intensity={0.4} />
      <Blob state={state} pulseSeed={pulseSeed} />
    </Canvas>
  );
}
