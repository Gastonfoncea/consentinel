"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";
import { STATE_PARAMS, type BlobState } from "./states";

const LERP_RATE = 1.6;

interface BlobProps {
  state: BlobState;
}

function Blob({ state }: BlobProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const targetRef = useRef(STATE_PARAMS.idle);

  useEffect(() => {
    targetRef.current = STATE_PARAMS[state];
  }, [state]);

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

    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.05;
      meshRef.current.rotation.y += delta * 0.07;
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

export default function BlobCanvas({ state }: BlobProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.4], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.4} />
      <Blob state={state} />
    </Canvas>
  );
}
