"use client";

import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { BOARD, KEYS, KNOB } from "./layout";
import {
  CAP,
  buildLegendAtlas,
  engravingTexture,
  keycapGeometry,
  knurlTexture,
  slabGeometry,
} from "./geometry";
import {
  focus,
  glow,
  keyState,
  knob,
  now,
  pressKey,
  releaseKey,
  rig,
  ripples,
  type Colorway,
} from "@/lib/store";

const CAP_Y = 0.62;
const PRESS_TRAVEL = 0.17;
const ROW_TILT = [0.1, 0.1, 0.05, 0, -0.05, -0.08];
const ROW_LIFT = [0.07, 0.06, 0.02, 0, 0.01, 0.03];

// How far each layer travels when the board is pulled apart.
const EXPLODE = {
  caps: 4.6,
  switches: 3.2,
  plate: 2.0,
  pcb: 1.0,
  bottom: -1.5,
  weight: -0.9,
};
// Each layer starts moving a little after the one above it, so the stack fans open instead of sliding as a block.
const STAGGER = {
  caps: 0,
  switches: 0.06,
  plate: 0.12,
  pcb: 0.18,
  bottom: 0.08,
  weight: 0.22,
};
// Extra travel for the layer being pointed at in the parts list (same order as LAYERS in Experience).
const FOCUS_LIFT = [0.7, 0.6, 0.6, 0.6, 0.45, -0.6, -0.6];

const staged = (e: number, delay: number) =>
  THREE.MathUtils.clamp((e - delay) / (1 - delay), 0, 1);

const noRaycast = () => null;

const glowVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragment = /* glsl */ `
  uniform float uTime;
  uniform float uBoost;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uRipples[6];
  varying vec2 vPos;
  void main() {
    float wave = 0.5 + 0.5 * sin(vPos.x * 0.45 + vPos.y * 0.3 - uTime * 1.1);
    vec3 col = mix(uA, uB, wave);
    float rip = 0.0;
    for (int i = 0; i < 6; i++) {
      float age = uTime - uRipples[i].z;
      if (age > 0.0 && age < 1.4) {
        float d = distance(vPos, uRipples[i].xy);
        float ring = exp(-pow((d - age * 8.0) * 1.3, 2.0));
        rip += ring * (1.0 - age / 1.4);
      }
    }
    gl_FragColor = vec4(col * (0.2 + uBoost + rip * 2.0), 1.0);
    #include <colorspace_fragment>
  }
`;

function makeMaterials(c: Colorway) {
  const cap = (hex: string) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.58,
      metalness: 0,
      envMapIntensity: 0.7,
    });
  const legend = (hex: string, map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({
      color: hex,
      map,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
  return {
    cap: { alpha: cap(c.alpha), mod: cap(c.mod), accent: cap(c.accent) },
    legend,
    case: new THREE.MeshPhysicalMaterial({
      color: c.case,
      metalness: 0.7,
      roughness: 0.46,
      clearcoat: 0.1,
      clearcoatRoughness: 0.6,
    }),
    plate: new THREE.MeshStandardMaterial({
      color: c.plate,
      metalness: 0.95,
      roughness: 0.32,
    }),
    pcb: new THREE.MeshStandardMaterial({
      color: "#10231b",
      metalness: 0.2,
      roughness: 0.6,
    }),
    housing: new THREE.MeshStandardMaterial({
      color: "#191a1e",
      roughness: 0.45,
    }),
    housingTop: new THREE.MeshPhysicalMaterial({
      color: "#dfe6f2",
      roughness: 0.12,
      transparent: true,
      opacity: 0.45,
    }),
    stem: new THREE.MeshStandardMaterial({ color: "#e0343c", roughness: 0.4 }),
    led: new THREE.MeshBasicMaterial({ color: c.glowA, toneMapped: false }),
    // Not fully metallic: when the board is flipped the brass faces away from the bright softboxes,
    // and a pure metal would only reflect the dark floor and read as black.
    brass: new THREE.MeshPhysicalMaterial({
      color: "#d4a64e",
      metalness: 0.72,
      roughness: 0.3,
      envMapIntensity: 1.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#111214",
      roughness: 0.9,
    }),
    knobTop: new THREE.MeshStandardMaterial({
      color: c.case,
      metalness: 1,
      roughness: 0.25,
    }),
    glow: new THREE.ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      uniforms: {
        uTime: { value: 0 },
        uBoost: { value: 0 },
        uA: { value: new THREE.Color(c.glowA) },
        uB: { value: new THREE.Color(c.glowB) },
        uRipples: { value: ripples.map(() => new THREE.Vector3(0, 0, -100)) },
      },
    }),
  };
}

const tweenColor = (target: THREE.Color, hex: string) => {
  const to = new THREE.Color(hex);
  gsap.to(target, {
    r: to.r,
    g: to.g,
    b: to.b,
    duration: 0.9,
    ease: "power2.out",
    overwrite: true,
  });
};

interface Props {
  colorway: Colorway;
  switchColor: string;
  /** When false, Esc, Enter and the knob dot take the modifier colour instead of the accent. */
  accents: boolean;
  onKnob: () => void;
}

const HOMING = new Set(["KeyF", "KeyJ"]);

export default function Keyboard({
  colorway,
  switchColor,
  accents,
  onKnob,
}: Props) {
  const [assets] = useState(() => {
    const atlas = buildLegendAtlas(KEYS);
    const m = makeMaterials(colorway);
    const knurl = knurlTexture();
    return {
      atlas,
      m,
      legends: {
        alpha: m.legend(colorway.legendAlpha, atlas.tex),
        mod: m.legend(colorway.legendMod, atlas.tex),
        accent: m.legend(colorway.legendAccent, atlas.tex),
      },
      knobSide: new THREE.MeshStandardMaterial({
        color: colorway.case,
        metalness: 1,
        roughness: 0.3,
        bumpMap: knurl,
        bumpScale: 3,
      }),
      spaceLegend: new THREE.MeshBasicMaterial({
        map: engravingTexture("VENTIS", 22),
        color: colorway.legendAlpha,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      engraving: new THREE.MeshBasicMaterial({
        map: engravingTexture("Ventis-75   No. 001 of 500"),
        color: "#2b1d06",
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      }),
    };
  });
  const { m, legends, atlas } = assets;

  const geo = useMemo(
    () => ({
      frame: slabGeometry(17, 7.25, 0.55, 0.75, { w: 16.3, d: 6.55, r: 0.22 }),
      bottom: slabGeometry(17, 7.25, 0.55, 0.5),
      housing: new THREE.BoxGeometry(0.78, 0.3, 0.78),
      housingTop: new THREE.BoxGeometry(0.68, 0.2, 0.68),
      homing: new THREE.BoxGeometry(0.24, 0.03, 0.05),
      spaceLegend: new THREE.PlaneGeometry(2.6, 0.325),
      stem: new THREE.BoxGeometry(0.2, 0.16, 0.2),
      led: new THREE.BoxGeometry(0.22, 0.03, 0.12),
      knob: new THREE.CylinderGeometry(0.6, 0.64, 0.5, 72),
    }),
    [],
  );

  // Retint everything when the colourway changes.
  useEffect(() => {
    const c = colorway;
    tweenColor(m.cap.alpha.color, c.alpha);
    tweenColor(m.cap.mod.color, c.mod);
    tweenColor(m.cap.accent.color, accents ? c.accent : c.mod);
    tweenColor(legends.alpha.color, c.legendAlpha);
    tweenColor(legends.mod.color, c.legendMod);
    tweenColor(legends.accent.color, accents ? c.legendAccent : c.legendMod);
    tweenColor(m.case.color, c.case);
    tweenColor(m.plate.color, c.plate);
    tweenColor(m.led.color, c.glowA);
    tweenColor(m.knobTop.color, c.case);
    tweenColor(assets.knobSide.color, c.case);
    tweenColor(assets.spaceLegend.color, c.legendAlpha);
    tweenColor(m.glow.uniforms.uA.value, c.glowA);
    tweenColor(m.glow.uniforms.uB.value, c.glowB);
  }, [colorway, accents, m, legends, assets]);

  useEffect(() => tweenColor(m.stem.color, switchColor), [switchColor, m]);

  const caps = useRef<THREE.Group>(null!);
  const switches = useRef<THREE.Group>(null!);
  const plate = useRef<THREE.Group>(null!);
  const pcb = useRef<THREE.Group>(null!);
  const top = useRef<THREE.Group>(null!);
  const lift = useRef(FOCUS_LIFT.map(() => 0));
  const bottom = useRef<THREE.Group>(null!);
  const weight = useRef<THREE.Group>(null!);
  const knobRef = useRef<THREE.Group>(null!);
  const capRefs = useRef<(THREE.Group | null)[]>([]);
  const inst = useRef<(THREE.InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const mat = new THREE.Matrix4();
    KEYS.forEach((k, i) => {
      mat.makeTranslation(k.x, 0, k.z);
      inst.current.forEach((mesh) => mesh?.setMatrixAt(i, mat));
    });
    inst.current.forEach((mesh) => {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const e = rig.explode;
    const l = lift.current;
    for (let i = 0; i < l.length; i++) {
      l[i] = THREE.MathUtils.damp(l[i], focus.layer === i ? 1 : 0, 9, dt);
    }
    const f = (i: number) => l[i] * FOCUS_LIFT[i] * e;
    caps.current.position.y = staged(e, STAGGER.caps) * EXPLODE.caps + f(0);
    switches.current.position.y =
      staged(e, STAGGER.switches) * EXPLODE.switches + f(1);
    plate.current.position.y = staged(e, STAGGER.plate) * EXPLODE.plate + f(2);
    pcb.current.position.y = staged(e, STAGGER.pcb) * EXPLODE.pcb + f(3);
    top.current.position.y = f(4);
    bottom.current.position.y =
      staged(e, STAGGER.bottom) * EXPLODE.bottom + f(5);
    weight.current.position.y =
      staged(e, STAGGER.weight) * EXPLODE.weight + f(6);

    for (let i = 0; i < KEYS.length; i++) {
      const g = capRefs.current[i];
      if (!g) continue;
      const s = keyState[i];
      s.press = THREE.MathUtils.damp(
        s.press,
        s.target,
        s.target > s.press ? 48 : 20,
        dt,
      );
      g.position.y =
        CAP_Y + ROW_LIFT[KEYS[i].row] - s.press * PRESS_TRAVEL + s.drop * 7;
      g.visible = s.drop < 0.995;
    }

    const u = m.glow.uniforms;
    u.uTime.value = now();
    u.uBoost.value = glow.boost;
    ripples.forEach((r, i) =>
      (u.uRipples.value as THREE.Vector3[])[i].set(r.x, r.y, r.t),
    );

    const k = knobRef.current;
    const target =
      knob.turns * ((Math.PI * 2) / 3) +
      (typeof window !== "undefined" ? window.scrollY * 0.0025 : 0);
    k.rotation.y = THREE.MathUtils.damp(k.rotation.y, target, 6, dt);
  });

  const down = (i: number) => (ev: ThreeEvent<PointerEvent>) => {
    ev.stopPropagation();
    pressKey(i, { hold: true });
    // the page counts taps as typing (see Experience)
    window.dispatchEvent(new CustomEvent("ventis:tap", { detail: i }));
  };
  const up = (i: number) => () => releaseKey(i);
  const over = (ev: ThreeEvent<PointerEvent>) => {
    ev.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const out = (i: number) => () => {
    document.body.style.cursor = "";
    if (i >= 0) releaseKey(i);
  };

  const instanced = (
    slot: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    y: number,
  ) => (
    <instancedMesh
      ref={(el) => {
        inst.current[slot] = el;
      }}
      args={[geometry, material, KEYS.length]}
      position-y={y}
      frustumCulled={false}
      castShadow={slot === 0}
    />
  );

  return (
    <group>
      {/* keycaps + knob */}
      <group ref={caps}>
        {KEYS.map((k, i) => (
          <group
            key={k.id}
            ref={(el) => {
              capRefs.current[i] = el;
            }}
            position={[k.x, CAP_Y, k.z]}
            rotation-x={ROW_TILT[k.row]}
          >
            <mesh
              geometry={keycapGeometry(k.w)}
              material={m.cap[k.kind]}
              castShadow
              receiveShadow
              onPointerDown={down(i)}
              onPointerUp={up(i)}
              onPointerOver={over}
              onPointerOut={out(i)}
            />
            {k.label && (
              <mesh
                geometry={atlas.geos[i]}
                material={legends[k.kind]}
                position-y={CAP.h / 2 + 0.004}
                rotation-x={-Math.PI / 2}
                raycast={noRaycast}
              />
            )}
            {k.code === "Space" && (
              <mesh
                geometry={geo.spaceLegend}
                material={assets.spaceLegend}
                position={[0, CAP.h / 2 + 0.004, 0.12]}
                rotation-x={-Math.PI / 2}
                raycast={noRaycast}
              />
            )}
            {HOMING.has(k.code) && (
              <mesh
                geometry={geo.homing}
                material={m.cap[k.kind]}
                position={[0, CAP.h / 2 + 0.01, 0.24]}
                raycast={noRaycast}
              />
            )}
          </group>
        ))}

        <group ref={knobRef} position={[KNOB.x, 0.7, KNOB.z]}>
          <mesh
            geometry={geo.knob}
            material={[assets.knobSide, m.knobTop, m.knobTop]}
            castShadow
            onPointerOver={over}
            onPointerOut={out(-1)}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              onKnob();
            }}
          />
          <mesh
            position={[0, 0.252, -0.38]}
            rotation-x={-Math.PI / 2}
            material={m.cap.accent}
            raycast={noRaycast}
          >
            <circleGeometry args={[0.07, 24]} />
          </mesh>
        </group>
      </group>

      {/* switches */}
      <group ref={switches}>
        {instanced(0, geo.housing, m.housing, 0.13)}
        {instanced(1, geo.housingTop, m.housingTop, 0.33)}
        {instanced(2, geo.stem, m.stem, 0.5)}
      </group>

      {/* plate, with the light that leaks between the caps */}
      <group ref={plate}>
        <mesh position-y={-0.04} material={m.plate} receiveShadow castShadow>
          <boxGeometry args={[BOARD.w + 0.15, 0.08, BOARD.d + 0.15]} />
        </mesh>
        <mesh
          position-y={0.004}
          rotation-x={-Math.PI / 2}
          material={m.glow}
          raycast={noRaycast}
        >
          <planeGeometry args={[BOARD.w + 0.1, BOARD.d + 0.1]} />
        </mesh>
      </group>

      {/* PCB */}
      <group ref={pcb}>
        <mesh position-y={-0.3} material={m.pcb} castShadow>
          <boxGeometry args={[BOARD.w + 0.1, 0.07, BOARD.d + 0.1]} />
        </mesh>
        <group position-z={0.3}>{instanced(3, geo.led, m.led, -0.255)}</group>
      </group>

      {/* top case, with the USB-C port on its back edge */}
      <group ref={top}>
        <mesh
          geometry={geo.frame}
          material={m.case}
          position-y={-0.4}
          castShadow
          receiveShadow
        />
        <mesh
          position={[-5.6, -0.03, -3.66]}
          material={m.rubber}
          raycast={noRaycast}
        >
          <boxGeometry args={[0.95, 0.34, 0.06]} />
        </mesh>
        <mesh
          position={[-5.6, -0.03, -3.67]}
          material={m.knobTop}
          raycast={noRaycast}
        >
          <boxGeometry args={[0.62, 0.08, 0.06]} />
        </mesh>
      </group>

      {/* bottom case, feet and weight */}
      <group ref={bottom}>
        <mesh
          geometry={geo.bottom}
          material={m.case}
          position-y={-1.0}
          castShadow
          receiveShadow
        />
        {[
          [-7.4, 2.8],
          [7.4, 2.8],
          [-7.4, -2.8],
          [7.4, -2.8],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, -1.07, z]} material={m.rubber}>
            <cylinderGeometry args={[0.32, 0.32, 0.06, 32]} />
          </mesh>
        ))}
        <group ref={weight}>
          <mesh position-y={-1.07} material={m.brass} castShadow>
            <boxGeometry args={[9, 0.07, 2.6]} />
          </mesh>
          <mesh
            position-y={-1.108}
            rotation-x={Math.PI / 2}
            material={assets.engraving}
          >
            <planeGeometry args={[7.2, 0.9]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
