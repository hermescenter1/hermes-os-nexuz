"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame }                      from "@react-three/fiber";
import * as THREE                                from "three";

// ── Module-level WebGL cache ────────────────────────────────────────────────

let _gl: boolean | null = null;
function canUseWebGL(): boolean {
  if (_gl !== null) return _gl;
  try {
    const c = document.createElement("canvas");
    _gl = !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    _gl = false;
  }
  return _gl ?? false;
}

// ── Reduced-motion hook ─────────────────────────────────────────────────────

function useReducedMotion(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setV(mq.matches);
    const fn = (e: MediaQueryListEvent) => setV(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return v;
}

// ── Geographic node helper ──────────────────────────────────────────────────

function geoNode(latDeg: number, lonDeg: number, r: number): THREE.Vector3 {
  const lat = latDeg * (Math.PI / 180);
  const lon = lonDeg * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
   -r * Math.cos(lat) * Math.sin(lon),
  );
}

// ── Network topology ────────────────────────────────────────────────────────

const R = 1.80;

const HUB_LATLONS: [number, number][] = [
  [ 42, -100], // 0  N.America
  [-22,  -55], // 1  S.America
  [ 50,    8], // 2  W.Europe
  [ 52,   35], // 3  E.Europe
  [  8,   12], // 4  W.Africa
  [-28,   25], // 5  S.Africa
  [ 32,   42], // 6  Middle East
  [ 22,   78], // 7  India
  [ 58,   90], // 8  Russia
  [ 36,  115], // 9  E.Asia
  [  5,  105], // 10 SE.Asia
  [ 36,  138], // 11 Japan
  [-25,  133], // 12 Australia
  [ 62,   18], // 13 Nordic
];

const EDGES: [number, number][] = [
  [0, 2], [0, 1], [0, 3], [0, 6],
  [1, 4], [1, 5], [1, 2],
  [2, 3], [2, 13], [2, 6],
  [3, 13], [3, 6], [3, 8],
  [4, 5], [4, 6],
  [5, 12],
  [6, 7], [6, 8],
  [7, 8], [7, 9], [7, 10],
  [8, 9],
  [9, 10], [9, 11],
  [10, 11], [10, 12],
  [11, 12],
];

// ── Data pulses (InstancedMesh, two layers: sharp + halo) ──────────────────

const PULSE_N = 12;

function DataPulses({
  curves,
  slow,
}: {
  curves: THREE.QuadraticBezierCurve3[];
  slow: boolean;
}) {
  const sharpRef = useRef<THREE.InstancedMesh>(null);
  const haloRef  = useRef<THREE.InstancedMesh>(null);

  const ts   = useRef(Array.from({ length: PULSE_N }, (_, i) => i / PULSE_N));
  const spds = useMemo(
    () => Array.from({ length: PULSE_N }, (_, i) => 0.18 + (i * 0.038) % 0.22),
    [],
  );
  const cidx = useMemo(
    () => Array.from({ length: PULSE_N }, (_, i) => i % Math.max(curves.length, 1)),
    [curves.length],
  );
  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _v = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!sharpRef.current || curves.length === 0) return;
    const scale = slow ? 0.3 : 1;
    for (let i = 0; i < PULSE_N; i++) {
      ts.current[i] += delta * spds[i] * scale;
      if (ts.current[i] > 1) ts.current[i] -= 1;
      curves[cidx[i]].getPoint(ts.current[i], _v);
      _m.setPosition(_v);
      sharpRef.current.setMatrixAt(i, _m);
      haloRef.current?.setMatrixAt(i, _m);
    }
    sharpRef.current.instanceMatrix.needsUpdate = true;
    if (haloRef.current) haloRef.current.instanceMatrix.needsUpdate = true;
  });

  if (curves.length === 0) return null;
  return (
    <>
      <instancedMesh ref={sharpRef} args={[undefined, undefined, PULSE_N]}>
        <sphereGeometry args={[0.016, 5, 5]} />
        <meshBasicMaterial
          color={0x00ffff}
          transparent
          opacity={1.0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh ref={haloRef} args={[undefined, undefined, PULSE_N]}>
        <sphereGeometry args={[0.058, 5, 5]} />
        <meshBasicMaterial
          color={0x00ccff}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

// ── Orbital ring system ─────────────────────────────────────────────────────

function SatDot({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[0.060, 8, 8]} />
        <meshBasicMaterial
          color={0x00e5ff}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.024, 8, 8]} />
        <meshBasicMaterial
          color={0x00ffff}
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function OrbitalSystem({ slow }: { slow: boolean }) {
  const dot1 = useRef<THREE.Group>(null);
  const dot2 = useRef<THREE.Group>(null);
  const dot3 = useRef<THREE.Group>(null);
  const t    = useRef(0);

  const R1 = 2.30, R2 = 2.68, R3 = 3.10;

  useFrame((_, delta) => {
    t.current += delta * (slow ? 0.25 : 1);
    const s = t.current;
    if (dot1.current) { const a = s * 0.38;        dot1.current.position.set(Math.cos(a) * R1, 0, Math.sin(a) * R1); }
    if (dot2.current) { const a = s * 0.24 + 2.09; dot2.current.position.set(Math.cos(a) * R2, 0, Math.sin(a) * R2); }
    if (dot3.current) { const a = s * 0.16 + 4.19; dot3.current.position.set(Math.cos(a) * R3, 0, Math.sin(a) * R3); }
  });

  function Ring({ r, outerOp, innerOp, color }: { r: number; outerOp: number; innerOp: number; color: number }) {
    return (
      <>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.009, 14, 140]} />
          <meshBasicMaterial color={color}   transparent opacity={outerOp} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.004, 8, 140]} />
          <meshBasicMaterial color={0x00ffff} transparent opacity={innerOp} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <group rotation={[0.28, 0, 0.12]}>
        <Ring r={R1} outerOp={0.28} innerOp={0.55} color={0x00e5ff} />
        <SatDot groupRef={dot1} />
      </group>
      <group rotation={[0.77, 0, 0.32]}>
        <Ring r={R2} outerOp={0.20} innerOp={0.40} color={0x38bdf8} />
        <SatDot groupRef={dot2} />
      </group>
      <group rotation={[1.26, 0, 0.60]}>
        <Ring r={R3} outerOp={0.14} innerOp={0.28} color={0x0099cc} />
        <SatDot groupRef={dot3} />
      </group>
    </>
  );
}

// ── Main globe body (rotates) ───────────────────────────────────────────────

function GlobeCore({ slow }: { slow: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * (slow ? 0.018 : 0.062);
  });

  const { nodeGeo, edgeLines, arcCurves, particleGeo, particleGlowGeo } = useMemo(() => {
    const hubs = HUB_LATLONS.map(([lat, lon]) => geoNode(lat, lon, R));

    // Node geometry
    const nPos = new Float32Array(hubs.length * 3);
    hubs.forEach((v, i) => { nPos[i * 3] = v.x; nPos[i * 3 + 1] = v.y; nPos[i * 3 + 2] = v.z; });
    const nGeo = new THREE.BufferGeometry();
    nGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3));

    // Arc curves + line primitives
    const curves: THREE.QuadraticBezierCurve3[] = [];
    const lines: THREE.Line[] = [];
    EDGES.forEach(([a, b], i) => {
      const v1   = hubs[a], v2 = hubs[b];
      const dist = v1.distanceTo(v2);
      const mid  = v1.clone().add(v2).normalize().multiplyScalar(R * (1.10 + dist * 0.055));
      const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);
      curves.push(curve);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(44));
      const mat = new THREE.LineBasicMaterial({
        color:       new THREE.Color(0x00cce8),
        transparent: true,
        opacity:     0.22 + (i % 5) * 0.06,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
      });
      lines.push(new THREE.Line(geo, mat));
    });

    // Dense particle cloud (Fibonacci sphere)
    const phi   = Math.PI * (3 - Math.sqrt(5));
    const pN    = 700;
    const pPos  = new Float32Array(pN * 3);
    for (let i = 0; i < pN; i++) {
      const r      = 2.22 + (i % 9) * 0.065;
      const theta  = phi * i;
      const cosPhi = 1 - (2 * i) / pN;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      pPos[i * 3] = r * sinPhi * Math.cos(theta);  pPos[i * 3 + 1] = r * cosPhi;  pPos[i * 3 + 2] = r * sinPhi * Math.sin(theta);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));

    // Outer glow particle layer
    const gN   = 200;
    const gPos = new Float32Array(gN * 3);
    for (let i = 0; i < gN; i++) {
      const r      = 2.38 + (i % 7) * 0.10;
      const theta  = phi * i * 2.4;
      const cosPhi = 1 - (2 * i) / gN;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      gPos[i * 3] = r * sinPhi * Math.cos(theta);  gPos[i * 3 + 1] = r * cosPhi;  gPos[i * 3 + 2] = r * sinPhi * Math.sin(theta);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));

    return { nodeGeo: nGeo, edgeLines: lines, arcCurves: curves, particleGeo: pGeo, particleGlowGeo: gGeo };
  }, []);

  return (
    <group ref={groupRef}>

      {/* Core dark-glass sphere */}
      <mesh>
        <sphereGeometry args={[1.72, 72, 72]} />
        <meshPhongMaterial
          color={new THREE.Color(0x000d1c)}
          emissive={new THREE.Color(0x001d40)}
          emissiveIntensity={0.75}
          shininess={160}
          specular={new THREE.Color(0x005580)}
          transparent
          opacity={0.98}
        />
      </mesh>

      {/* Inner energy glow sphere */}
      <mesh>
        <sphereGeometry args={[0.90, 16, 16]} />
        <meshBasicMaterial
          color={new THREE.Color(0x002255)}
          transparent
          opacity={0.20}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Icosahedron geodesic grid — fine holographic mesh */}
      <mesh>
        <icosahedronGeometry args={[1.738, 4]} />
        <meshBasicMaterial color={0x00e5ff} wireframe transparent opacity={0.048} depthWrite={false} />
      </mesh>

      {/* Lat/lon sphere overlay */}
      <mesh>
        <sphereGeometry args={[1.745, 24, 16]} />
        <meshBasicMaterial color={0x38bdf8} wireframe transparent opacity={0.028} depthWrite={false} />
      </mesh>

      {/* Network connection arcs */}
      {edgeLines.map((line, i) => <primitive key={i} object={line} />)}

      {/* Animated data pulses */}
      <DataPulses curves={arcCurves} slow={slow} />

      {/* Hub nodes — sharp bright dots */}
      <points geometry={nodeGeo}>
        <pointsMaterial color={0x00ffff} size={0.028} transparent opacity={0.95}
          blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>

      {/* Hub nodes — soft glow halo */}
      <points geometry={nodeGeo}>
        <pointsMaterial color={0x00ccff} size={0.090} transparent opacity={0.24}
          blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>

      {/* Dense particle cloud */}
      <points geometry={particleGeo}>
        <pointsMaterial color={0x00ccff} size={0.010} transparent opacity={0.50}
          blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>

      {/* Soft outer particle glow */}
      <points geometry={particleGlowGeo}>
        <pointsMaterial color={0x38bdf8} size={0.042} transparent opacity={0.16}
          blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>

      {/* Atmosphere 1 — inner rim, phong for limb glow via lighting */}
      <mesh>
        <sphereGeometry args={[1.90, 36, 36]} />
        <meshPhongMaterial
          color={new THREE.Color(0x00ddff)} shininess={0} transparent opacity={0.13}
          side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>

      {/* Atmosphere 2 — mid haze */}
      <mesh>
        <sphereGeometry args={[2.12, 28, 28]} />
        <meshPhongMaterial
          color={new THREE.Color(0x0077bb)} shininess={0} transparent opacity={0.07}
          side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>

      {/* Atmosphere 3 — outer corona */}
      <mesh>
        <sphereGeometry args={[2.55, 22, 22]} />
        <meshBasicMaterial
          color={new THREE.Color(0x003d77)} transparent opacity={0.044}
          side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>

      {/* Atmosphere 4 — deep space fade */}
      <mesh>
        <sphereGeometry args={[3.30, 16, 16]} />
        <meshBasicMaterial
          color={new THREE.Color(0x001133)} transparent opacity={0.018}
          side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>

    </group>
  );
}

// ── CSS-only fallback ───────────────────────────────────────────────────────

function GlobeFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="relative" style={{ width: "min(360px, 80vw)", height: "min(360px, 80vw)" }}>
        <div
          className="absolute inset-0 rounded-full animate-l-pulse"
          style={{
            background: "radial-gradient(circle at 38% 35%, #002244 0%, #001028 50%, #000814 100%)",
            boxShadow:
              "0 0 120px rgba(0,229,255,0.28), 0 0 240px rgba(0,150,255,0.12)," +
              " inset 0 0 80px rgba(0,80,180,0.15)",
            border: "1px solid rgba(0,229,255,0.16)",
          }}
        />
        {[0.84, 0.6, 0.32].map((f, i) => (
          <div key={i} className="absolute" style={{
            left: `${(1 - f) * 50}%`, right: `${(1 - f) * 50}%`,
            top: `${50 - f * 12}%`, height: `${f * 24}%`,
            borderRadius: "50%", border: `1px solid rgba(0,229,255,${0.05 + i * 0.02})`,
          }} />
        ))}
        <div className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 65%)" }} />
      </div>
    </div>
  );
}

// ── Canvas wrapper ──────────────────────────────────────────────────────────

function GlobeCanvas() {
  const slow = useReducedMotion();
  return (
    <Canvas
      camera={{ position: [0, 0.8, 4.6], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "default" }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.12} />
      {/* Key: upper right front, strong cyan */}
      <pointLight position={[7, 5, 5]}   color="#00e5ff" intensity={6.0} />
      {/* Fill: lower left back */}
      <pointLight position={[-4, -2, -3]} color="#003d77" intensity={2.5} />
      {/* Rim: upper left */}
      <pointLight position={[-3, 5, 3]}  color="#38bdf8" intensity={2.2} />
      {/* Camera-axis: illuminates BackSide atmosphere rim toward camera */}
      <pointLight position={[0, 0, 6]}   color="#005577" intensity={3.8} />
      {/* Interior: lights inside-facing atmosphere shells from center */}
      <pointLight position={[0, 0, 0]}   color="#0066cc" intensity={2.8} distance={2.4} decay={2} />

      <GlobeCore slow={slow} />
      <OrbitalSystem slow={slow} />
    </Canvas>
  );
}

// ── Entry point ─────────────────────────────────────────────────────────────

export default function HeroGlobe() {
  const [ready, setReady] = useState(false);
  const [hasGL, setHasGL] = useState(true);

  useEffect(() => {
    setHasGL(canUseWebGL());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!hasGL)  return <GlobeFallback />;
  return <GlobeCanvas />;
}
