'use client';

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { braidTexture } from './keyboard/textures';
import { rig, type Colorway } from '@/lib/store';

// Board-local coordinates: the USB-C port is on the back edge of the top case, facing -z.
const PORT = new THREE.Vector3(-5.6, -0.03, -3.69);
const MAT_Y = -1.11;
const WIRE = 0.055; // straight cable radius
const COIL_WIRE = 0.04;
const COIL_R = 0.19;
const COIL_PITCH = 0.1;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const COIL_Y = MAT_Y + COIL_R + COIL_WIRE + 0.005;

/** A helix wound around another curve, easing in and out at the ends so it meets the straight cable. */
class Coil extends THREE.Curve<THREE.Vector3> {
  private normals: THREE.Vector3[];
  private binormals: THREE.Vector3[];
  private steps = 400;

  constructor(
    private path: THREE.Curve<THREE.Vector3>,
    private turns: number,
    private radius: number,
  ) {
    super();
    const frames = path.computeFrenetFrames(this.steps, false);
    this.normals = frames.normals;
    this.binormals = frames.binormals;
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const c = this.path.getPointAt(t);
    const i = Math.min(this.steps, Math.round(t * this.steps));
    const ramp = THREE.MathUtils.smoothstep(t, 0, 0.04) * (1 - THREE.MathUtils.smoothstep(t, 0.96, 1));
    const a = t * this.turns * Math.PI * 2;
    const r = this.radius * ramp;
    return target
      .copy(c)
      .addScaledVector(this.normals[i], Math.cos(a) * r)
      .addScaledVector(this.binormals[i], Math.sin(a) * r);
  }
}

/** Opaque for the first part of a tube, then fading to nothing (tube UVs run 0 to 1 along its length). */
function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.35, '#fff');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 4);
  return new THREE.CanvasTexture(c);
}

/** Orients a Y-up part along a direction and places it. */
function along(obj: THREE.Object3D, at: THREE.Vector3, dir: THREE.Vector3) {
  obj.position.copy(at);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

/**
 * A coiled, paracord-sleeved USB-C cable for the desk shot, the way custom-keyboard people run theirs:
 * a short drop from the port, a coil lying on the mat behind the board, an aviator connector, then a run
 * off the back of the desk. Sleeve and metal follow the finish. Fades in and out with the desk.
 */
export default function Cable({ colorway }: { colorway: Colorway }) {
  const group = useRef<THREE.Group>(null!);

  const parts = useMemo(() => {
    const braid = braidTexture();
    const sleeve = (len: number) => {
      const map = braid.clone();
      map.repeat.set(len / 0.07, 1);
      return new THREE.MeshStandardMaterial({ roughness: 0.78, bumpMap: map, bumpScale: 1.2, transparent: true });
    };

    // port to the start of the coil: out of the plug, down onto the mat and back, clear of the board
    // (from the desk camera, the board hides anything less than about four units behind it)
    const drop = new THREE.CatmullRomCurve3([
      v(PORT.x, PORT.y, PORT.z - 0.52),
      v(-5.62, -0.25, -4.9),
      v(-5.8, MAT_Y + WIRE + 0.05, -5.7),
      v(-6.3, MAT_Y + WIRE, -6.8),
      v(-7.2, COIL_Y, -7.9),
    ]);
    // the coil lies across the mat behind the board, running left so it is seen side on
    const spine = new THREE.CatmullRomCurve3([
      v(-7.2, COIL_Y, -7.9),
      v(-9.2, COIL_Y, -8.5),
      v(-11.4, COIL_Y, -8.6),
      v(-13.4, COIL_Y, -8.3),
    ]);
    const turns = Math.round(spine.getLength() / COIL_PITCH);
    const coil = new Coil(spine, turns, COIL_R);
    // past the aviator connector, a straight run off the mat and across the desk
    const endDir = spine.getTangentAt(1);
    const aviatorAt = spine.getPointAt(1).addScaledVector(endDir, 0.38);
    const tailStart = aviatorAt.clone().addScaledVector(endDir, 0.5);
    const tail = new THREE.CatmullRomCurve3([
      tailStart,
      v(-15.2, MAT_Y + WIRE + 0.02, -8.7),
      v(-16.6, MAT_Y + WIRE, -9.8),
      v(-18.1, MAT_Y + WIRE, -11.8),
      v(-19.4, MAT_Y + WIRE, -14.6),
    ]);
    const spineToAviator = new THREE.LineCurve3(spine.getPointAt(1), aviatorAt);

    // the run off the desk fades out along its length instead of stopping dead
    const fading = (m: THREE.MeshStandardMaterial) => {
      m.alphaMap = fadeTexture();
      return m;
    };

    const tube = (curve: THREE.Curve<THREE.Vector3>, segs: number, r: number) =>
      new THREE.TubeGeometry(curve, segs, r, 10, false);

    const metal = new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.32, transparent: true });
    const bright = new THREE.MeshStandardMaterial({ color: '#d9dce0', metalness: 1, roughness: 0.18, transparent: true });

    return {
      drop: { geo: tube(drop, 80, WIRE), mat: sleeve(drop.getLength()) },
      coil: { geo: tube(coil, turns * 18, COIL_WIRE), mat: sleeve(turns * Math.PI * 2 * COIL_R) },
      link: { geo: tube(spineToAviator, 4, WIRE), mat: sleeve(0.4) },
      tail: { geo: tube(tail, 80, WIRE), mat: fading(sleeve(tail.getLength())) },
      metal,
      bright,
      // plug housing on the port, then its strain relief
      plug: new RoundedBoxGeometry(0.5, 0.56, 0.3, 3, 0.1),
      relief: new THREE.CylinderGeometry(WIRE * 1.15, 0.1, 0.24, 20),
      // the aviator: two knurled halves either side of a polished ring
      aviatorBody: new THREE.CylinderGeometry(0.15, 0.15, 0.32, 32),
      aviatorRing: new THREE.CylinderGeometry(0.165, 0.165, 0.07, 32),
      aviatorAt,
      endDir,
    };
  }, []);

  const plug = useRef<THREE.Group>(null!);
  const aviator = useRef<THREE.Group>(null!);
  useEffect(() => {
    along(plug.current, PORT, new THREE.Vector3(0, 0, -1));
    along(aviator.current, parts.aviatorAt, parts.endDir);
  }, [parts]);

  useEffect(() => {
    const sleeveColor = new THREE.Color(colorway.accent);
    [parts.drop, parts.coil, parts.link, parts.tail].forEach((p) => p.mat.color.copy(sleeveColor));
    parts.metal.color.set(colorway.case);
  }, [colorway, parts]);

  useFrame(() => {
    const d = rig.desk * rig.desk;
    const mats = [parts.drop.mat, parts.coil.mat, parts.link.mat, parts.tail.mat, parts.metal, parts.bright];
    mats.forEach((m) => {
      m.opacity = d;
      // fully opaque once it has faded in, so the coil's turns sort correctly
      m.transparent = d < 0.99 || m.alphaMap !== null;
      m.depthWrite = d > 0.5;
    });
    group.current.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = d > 0.9;
    });
  });

  return (
    <group ref={group}>
      <mesh geometry={parts.drop.geo} material={parts.drop.mat} />
      <mesh geometry={parts.coil.geo} material={parts.coil.mat} />
      <mesh geometry={parts.link.geo} material={parts.link.mat} />
      <mesh geometry={parts.tail.geo} material={parts.tail.mat} />

      <group ref={plug}>
        {/* y here runs along the cable, away from the port */}
        <mesh geometry={parts.plug} material={parts.metal} position-y={0.2} />
        <mesh geometry={parts.relief} material={parts.bright} position-y={0.42} />
      </group>

      <group ref={aviator}>
        <mesh geometry={parts.aviatorBody} material={parts.metal} position-y={-0.2} />
        <mesh geometry={parts.aviatorRing} material={parts.bright} />
        <mesh geometry={parts.aviatorBody} material={parts.metal} position-y={0.2} />
      </group>
    </group>
  );
}
