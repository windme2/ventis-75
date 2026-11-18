"use client";

import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { BOARD, KEYS, KNOB } from "./layout";
import {
  CAP,
  brushedTexture,
  buildLegendAtlas,
  capDish,
  dishedPlane,
  engravingTexture,
  grainTexture,
  keycapGeometry,
  knurlTexture,
  pcbTextures,
  plateGeometry,
  plateShape,
  slabGeometry,
  stabGeometry,
  stabOffset,
  switchGeometries,
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
  uniform float uCover;
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
    float light = 0.2 + uBoost + rip * 2.0;
    // closed, the gaps between caps sit in shadow; opened up, the plate shows through
    gl_FragColor = vec4(col * light, clamp(uCover + light * 0.35, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// The bright edge where a machined case is cut back to bare aluminium after anodising or coating.
const chamferColor = (hex: string) =>
  new THREE.Color(hex).lerp(new THREE.Color("#dfe2e6"), 0.7);

function makeMaterials(c: Colorway) {
  const grain = grainTexture();
  grain.repeat.set(3, 3);
  const brushed = brushedTexture();
  brushed.repeat.set(0.25, 2);
  const pcbTex = pcbTextures(KEYS, BOARD.w + 0.1, BOARD.d + 0.1);

  // PBT: matte, with a fine grain that breaks up the highlights and a soft sheen at grazing angles
  const cap = (hex: string) =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.72,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.25,
      metalness: 0,
      sheen: 0.35,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color("#ffffff"),
      envMapIntensity: 0.75,
    });
  // double-shot legends are plastic too, so they take the same light as the cap around them
  const legend = (hex: string, map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      map,
      roughness: 0.6,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      envMapIntensity: 0.75,
    });
  return {
    cap: { alpha: cap(c.alpha), mod: cap(c.mod), accent: cap(c.accent) },
    legend,
    // bead-blasted aluminium: the grain scatters the highlight into a soft satin sheen
    case: new THREE.MeshPhysicalMaterial({
      color: c.case,
      metalness: 0.7,
      roughness: 0.55,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.15,
      clearcoat: 0.1,
      clearcoatRoughness: 0.6,
    }),
    chamfer: new THREE.MeshStandardMaterial({
      color: chamferColor(c.case),
      metalness: 1,
      roughness: 0.14,
      envMapIntensity: 1.4,
    }),
    // brushed metal: streaks in the roughness and a highlight stretched along the grain
    plate: new THREE.MeshPhysicalMaterial({
      color: c.plate,
      metalness: 0.95,
      roughness: 0.38,
      roughnessMap: brushed,
      anisotropy: 0.6,
      envMapIntensity: 0.6,
    }),
    pcb: new THREE.MeshPhysicalMaterial({
      map: pcbTex.map,
      metalnessMap: pcbTex.metal,
      metalness: 1,
      roughness: 0.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.35,
    }),
    pcbEdge: new THREE.MeshStandardMaterial({
      color: "#a59a5c",
      roughness: 0.8,
    }),
    pcbBack: new THREE.MeshStandardMaterial({
      color: "#0c271c",
      roughness: 0.45,
    }),
    housing: new THREE.MeshStandardMaterial({
      color: "#1a1b1f",
      roughness: 0.5,
    }),
    // smoked clear polycarbonate
    housingTop: new THREE.MeshPhysicalMaterial({
      color: "#dde4ee",
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
    pins: new THREE.MeshStandardMaterial({
      color: "#d9b25f",
      metalness: 1,
      roughness: 0.25,
    }),
    socket: new THREE.MeshStandardMaterial({
      color: "#0d0d0f",
      roughness: 0.6,
    }),
    gasket: new THREE.MeshPhysicalMaterial({
      color: "#e9ece8",
      roughness: 0.45,
      transparent: true,
      opacity: 0.85,
    }),
    wire: new THREE.MeshStandardMaterial({
      color: "#c7cbd0",
      metalness: 1,
      roughness: 0.2,
    }),
    screw: new THREE.MeshStandardMaterial({
      color: "#2a2c30",
      metalness: 0.9,
      roughness: 0.35,
    }),
    stem: new THREE.MeshStandardMaterial({ color: "#e0343c", roughness: 0.35 }),
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
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uBoost: { value: 0 },
        uCover: { value: 0.9 },
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

// Ten silicone gaskets around the plate edge, as in the parts list.
const GASKETS: [number, number][] = [
  ...[-6, -2, 2, 6].flatMap((x): [number, number][] => [
    [x, -(BOARD.d + 0.15) / 2],
    [x, (BOARD.d + 0.15) / 2],
  ]),
  [-(BOARD.w + 0.15) / 2, 0],
  [(BOARD.w + 0.15) / 2, 0],
];
// Case screws on the underside, clear of the feet and the brass weight.
const SCREWS: [number, number][] = [
  [-5.6, -3.0],
  [0, -3.0],
  [5.6, -3.0],
  [-5.6, 3.0],
  [0, 3.0],
  [5.6, 3.0],
];

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

  const geo = useMemo(() => {
    const sw = switchGeometries();
    const pw = BOARD.w + 0.15;
    const pd = BOARD.d + 0.15;
    return {
      frame: slabGeometry(
        17,
        7.25,
        0.55,
        0.75,
        { w: 16.3, d: 6.55, r: 0.22 },
        0.06,
      ),
      bottom: slabGeometry(17, 7.25, 0.55, 0.5, undefined, 0.06, -1),
      ...sw,
      plate: plateGeometry(KEYS, pw, pd, 0.08),
      glow: new THREE.ShapeGeometry(plateShape(KEYS, pw - 0.05, pd - 0.05), 3),
      stab: stabGeometry(),
      socket: new THREE.BoxGeometry(0.42, 0.07, 0.3),
      homing: new THREE.BoxGeometry(0.24, 0.03, 0.05),
      spaceLegend: dishedPlane(2.6, 0.325, 6.25, 0.12),
      led: new THREE.BoxGeometry(0.22, 0.03, 0.12),
      knob: new THREE.CylinderGeometry(0.6, 0.64, 0.5, 72),
      screw: new THREE.CylinderGeometry(0.13, 0.13, 0.025, 24),
      screwHex: new THREE.CylinderGeometry(0.055, 0.055, 0.03, 6),
    };
  }, []);

  // long keys get a plate-mount stabiliser at each end, with the wire across the front
  const stabs = useMemo(
    () =>
      KEYS.filter((k) => k.w >= 2).map((k) => ({
        id: k.id,
        x: k.x,
        z: k.z - 0.04,
        o: stabOffset(k.w),
      })),
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
    tweenColor(m.chamfer.color, `#${chamferColor(c.case).getHexString()}`);
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
    u.uCover.value = 0.9 - 0.6 * e;
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
                raycast={noRaycast}
              />
            )}
            {k.code === "Space" && (
              <mesh
                geometry={geo.spaceLegend}
                material={assets.spaceLegend}
                raycast={noRaycast}
              />
            )}
            {HOMING.has(k.code) && (
              <mesh
                geometry={geo.homing}
                material={m.cap[k.kind]}
                position={[0, CAP.h / 2 + capDish(0, k.w) + 0.012, 0.24]}
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
      {/* switches: dark lower housing under the plate, smoked upper housing, cross stem, gold pins */}
      <group ref={switches}>
        {instanced(0, geo.lower, m.housing, 0)}
        {instanced(1, geo.upper, m.housingTop, 0)}
        {instanced(2, geo.stem, m.stem, 0)}
        {instanced(3, geo.pins, m.pins, 0)}
      </group>

      {/* plate with its switch cutouts, gaskets and stabilisers, plus the light that leaks between the caps */}
      <group ref={plate}>
        <mesh
          geometry={geo.plate}
          position-y={-0.08}
          material={m.plate}
          receiveShadow
          castShadow
        />
        <mesh
          geometry={geo.glow}
          position-y={0.004}
          rotation-x={-Math.PI / 2}
          material={m.glow}
          raycast={noRaycast}
        />
        {GASKETS.map(([x, z]) => (
          <mesh
            key={`${x}${z}`}
            position={[x, -0.04, z]}
            material={m.gasket}
            raycast={noRaycast}
          >
            <boxGeometry args={[0.7, 0.16, 0.14]} />
          </mesh>
        ))}
        {stabs.map((s) => (
          <group key={s.id} position={[s.x, 0, s.z]}>
            <mesh
              geometry={geo.stab}
              position-x={-s.o}
              material={m.housing}
              raycast={noRaycast}
            />
            <mesh
              geometry={geo.stab}
              position-x={s.o}
              material={m.housing}
              raycast={noRaycast}
            />
            <mesh
              position={[0, -0.13, 0.3]}
              rotation-z={Math.PI / 2}
              material={m.wire}
              raycast={noRaycast}
            >
              <cylinderGeometry args={[0.018, 0.018, s.o * 2, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* PCB: traces and pads on top, hot-swap sockets underneath, LEDs facing up */}
      <group ref={pcb}>
        <mesh
          position-y={-0.3}
          material={[
            m.pcbEdge,
            m.pcbEdge,
            m.pcb,
            m.pcbBack,
            m.pcbEdge,
            m.pcbEdge,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[BOARD.w + 0.1, 0.07, BOARD.d + 0.1]} />
        </mesh>
        <group position-z={0.3}>{instanced(4, geo.led, m.led, -0.255)}</group>
        <group position={[0.02, 0, -0.2]}>
          {instanced(5, geo.socket, m.socket, -0.37)}
        </group>
      </group>

      {/* top case, with the USB-C port on its back edge */}
      <group ref={top}>
        <mesh
          geometry={geo.frame}
          material={[m.case, m.case, m.chamfer]}
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
          material={[m.case, m.case, m.chamfer]}
          position-y={-1.0}
          castShadow
          receiveShadow
        />
        {SCREWS.map(([x, z]) => (
          <group key={`${x}${z}`} position={[x, -1.068, z]}>
            <mesh geometry={geo.screw} material={m.screw} raycast={noRaycast} />
            <mesh
              geometry={geo.screwHex}
              position-y={-0.004}
              material={m.rubber}
              raycast={noRaycast}
            />
          </group>
        ))}
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
