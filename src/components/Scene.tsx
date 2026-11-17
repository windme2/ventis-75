'use client';

import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import Keyboard from './keyboard/Keyboard';
import { intro, rig, spin, type Colorway } from '@/lib/store';

interface SceneProps {
  colorway: Colorway;
  switchColor: string;
  accents: boolean;
  /** Read out by screen readers in place of the canvas. */
  label: string;
  onKnob: () => void;
  onReady: () => void;
}

/** A soft white disc that fades to nothing at the edge, so the desk melts into the backdrop. */
function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.45, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 8);
}

/**
 * The lifestyle shot: a desk surface and a felt mat under the board, plus a warm lamp from the side.
 * Everything is driven by `rig.desk`, so it fades in and out with the scroll scrub.
 */
function Desk({ colorway }: { colorway: Colorway }) {
  const group = useRef<THREE.Group>(null!);
  const lamp = useRef<THREE.DirectionalLight>(null!);
  const parts = useMemo(() => {
    const alphaMap = fadeTexture();
    return {
      surface: new THREE.MeshStandardMaterial({ roughness: 0.85, transparent: true, alphaMap, depthWrite: false }),
      mat: new THREE.MeshStandardMaterial({ color: '#1c1d21', roughness: 1, transparent: true }),
      matGeo: roundedRect(25, 11.5, 0.9),
      plane: new THREE.PlaneGeometry(90, 90),
    };
  }, []);

  useEffect(() => {
    // the desk takes a darker shade of the backdrop, so it reads as the same room
    const to = new THREE.Color(colorway.backdrop).multiplyScalar(0.7);
    parts.surface.color.copy(to);
  }, [colorway, parts]);

  useFrame(() => {
    const d = rig.desk * rig.desk; // ease in late, so it never shows mid-flip
    group.current.visible = d > 0.01;
    parts.surface.opacity = d;
    parts.mat.opacity = d;
    lamp.current.intensity = d * 0.9;
  });

  return (
    <>
      <directionalLight ref={lamp} position={[-12, 8, 6]} color="#ffd8a8" intensity={0} />
      <group ref={group} visible={false}>
        <mesh geometry={parts.plane} material={parts.surface} position-y={-1.12} rotation-x={-Math.PI / 2} receiveShadow />
        <mesh geometry={parts.matGeo} material={parts.mat} position={[0.6, -1.11, 0.4]} rotation-x={-Math.PI / 2} receiveShadow />
      </group>
    </>
  );
}

function Rig({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  const g = useRef<THREE.Group>(null!);
  const frames = useRef(0);
  const look = useRef({ x: 0, y: 0 });
  const [still] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    // a couple of frames in, shaders are compiled and the board is on screen
    if (++frames.current === 3) onReady();
    const { viewport, size, pointer } = state;
    const narrow = size.width < 900;
    const fit = Math.min(1, viewport.width / (narrow ? 18.5 : 24));
    // a slow idle float, so the board never looks frozen between scrolls
    const t = state.clock.elapsedTime;
    const float = still ? 0 : Math.sin(t * 0.9) * 0.12;
    const sway = still ? 0 : Math.sin(t * 0.55) * 0.012;

    // the pointer nudges the board a few degrees
    look.current.x = THREE.MathUtils.damp(look.current.x, pointer.x, 4, dt);
    look.current.y = THREE.MathUtils.damp(look.current.y, pointer.y, 4, dt);
    // drag-to-turn in the Finishes section
    spin.value = THREE.MathUtils.damp(spin.value, spin.target, 6, dt);

    g.current.position.set(
      narrow ? 0 : rig.x * viewport.width,
      (narrow ? rig.ny : rig.y) * viewport.height + float,
      0,
    );
    g.current.rotation.set(
      rig.rx + intro.rx - look.current.y * 0.07 + sway,
      rig.ry + intro.ry + look.current.x * 0.12 + spin.value,
      rig.rz + sway * 0.6,
    );
    g.current.scale.setScalar((narrow ? Math.min(rig.scale, 1) : rig.scale) * fit * intro.scale);
  });

  return <group ref={g}>{children}</group>;
}

export default function Scene({ colorway, switchColor, accents, label, onKnob, onReady }: SceneProps) {
  // Start a little under full sharpness and let the performance monitor move it either way.
  const [maxDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 2));
  const [dpr, setDpr] = useState(() => Math.min(maxDpr, 1.5));

  return (
    <Canvas
      className="stage"
      role="img"
      aria-label={label}
      shadows="percentage"
      dpr={dpr}
      camera={{ position: [0, 0, 30], fov: 28, near: 1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Lowers the render resolution on slow devices, and raises it again when frames are cheap. */}
      <PerformanceMonitor
        flipflops={4}
        onChange={({ factor }) => setDpr(Math.max(0.75, Math.min(maxDpr, Math.round((0.75 + 1.25 * factor) * 4) / 4)))}
        onFallback={() => setDpr(Math.min(maxDpr, 1))}
      />
      <Suspense fallback={null}>
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[7, 14, 9]}
          intensity={1.7}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
          shadow-camera-left={-13}
          shadow-camera-right={13}
          shadow-camera-top={13}
          shadow-camera-bottom={-13}
          shadow-camera-near={1}
          shadow-camera-far={50}
        />
        <Rig onReady={onReady}>
          <Keyboard colorway={colorway} switchColor={switchColor} accents={accents} onKnob={onKnob} />
          <Desk colorway={colorway} />
        </Rig>
        {/* studio softboxes, rendered once into the reflection map (no HDR download) */}
        <Environment resolution={256} frames={1} environmentIntensity={0.9}>
          <Lightformer form="rect" intensity={2.2} position={[0, 9, 2]} rotation-x={Math.PI / 2} scale={[16, 6, 1]} />
          <Lightformer form="rect" intensity={1.6} position={[-11, 2, 5]} rotation-y={Math.PI / 2} scale={[9, 4, 1]} />
          <Lightformer form="rect" intensity={1.1} position={[11, 1, 3]} rotation-y={-Math.PI / 2} scale={[9, 3, 1]} />
          <Lightformer form="rect" intensity={0.9} position={[0, -1, 14]} scale={[22, 5, 1]} />
          <Lightformer form="rect" intensity={0.5} position={[0, -8, 4]} rotation-x={-Math.PI / 2} scale={[14, 4, 1]} />
          <Lightformer form="ring" intensity={2} position={[6, 6, 10]} scale={3} />
        </Environment>
      </Suspense>
    </Canvas>
  );
}
