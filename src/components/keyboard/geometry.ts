import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { KeyDef } from './layout';

/** Keycap size in key units (1u = 19.05 mm). `dish` is how deep the cylindrical top is scooped. */
export const CAP = { h: 0.42, d: 0.94, gap: 0.06, inset: 0.1, r: 0.075, dish: 0.035 };

// the back face leans in more than the front one
const LEAN_BACK = CAP.inset * 1.3;
const LEAN_FRONT = CAP.inset * 0.7;
// how far in from each side the dish curves; wider keys are flat in the middle, like a real Cherry set
const DISH_SPAN = 0.5 - CAP.gap / 2 - CAP.inset;

const clamp = THREE.MathUtils.clamp;

function dishShape(x: number, w: number) {
  const half = (w - CAP.gap) / 2 - CAP.inset;
  const flat = Math.max(0, half - DISH_SPAN);
  const run = half - flat;
  const t = clamp((Math.abs(x) - flat) / run, 0, 1);
  return { t, run, sign: Math.sign(x) };
}

/** Height of the scooped top at `x` (cap-local, top surface), from 0 at the edges to -dish in the middle. */
export function capDish(x: number, w: number) {
  const { t } = dishShape(x, w);
  return -CAP.dish * (1 - t * t);
}

function capDishSlope(x: number, w: number) {
  const { t, run, sign } = dishShape(x, w);
  return t > 0 && t < 1 ? (sign * 2 * CAP.dish * t) / run : 0;
}

/**
 * Grid position (-0.5..0.5) to a point along one axis of a rounded box: `seg` segments for each rounded
 * edge and `mid` for the flat part, so the curves stay smooth however wide the key is.
 */
function axis(g: number, half: number, r: number, seg: number, mid: number) {
  const total = 2 * seg + mid;
  const i = (g + 0.5) * total;
  if (i <= seg) return -half + r * (i / seg);
  if (i >= seg + mid) return half - r * ((total - i) / seg);
  return -(half - r) + 2 * (half - r) * ((i - seg) / mid);
}

const capCache = new Map<number, THREE.BufferGeometry>();

/**
 * Cherry-profile keycap: a rounded box tapered towards the top, with a cylindrical scoop across the top
 * face. Normals are worked out from the shape itself, so the scoop and the leaning walls catch the light.
 */
export function keycapGeometry(w: number) {
  const hit = capCache.get(w);
  if (hit) return hit;
  const cw = w - CAP.gap;
  const hw = cw / 2;
  const hh = CAP.h / 2;
  const hd = CAP.d / 2;
  const r = CAP.r;
  const seg = 4;
  const mx = Math.max(8, Math.round(cw * 10));
  const my = 2;
  const mz = 8;
  const g = new THREE.BoxGeometry(1, 1, 1, 2 * seg + mx, 2 * seg + my, 2 * seg + mz);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  const v = new THREE.Vector3();
  const core = new THREE.Vector3();
  const d = new THREE.Vector3();
  const nn = new THREE.Vector3();

  for (let i = 0; i < p.count; i++) {
    v.set(axis(p.getX(i), hw, r, seg, mx), axis(p.getY(i), hh, r, seg, my), axis(p.getZ(i), hd, r, seg, mz));
    core.set(clamp(v.x, -(hw - r), hw - r), clamp(v.y, -(hh - r), hh - r), clamp(v.z, -(hd - r), hd - r));
    d.subVectors(v, core);
    if (d.lengthSq() < 1e-12) d.set(0, 1, 0);
    d.normalize();
    v.copy(core).addScaledVector(d, r);

    const t = (v.y + hh) / CAP.h;
    const lean = v.z < 0 ? LEAN_BACK : LEAN_FRONT;
    const x = v.x * ((hw - CAP.inset * t) / hw);
    const z = v.z * ((hd - lean * t) / hd);
    const top = Math.max(0, d.y);
    const y = v.y + capDish(x, w) * top * top;
    p.setXYZ(i, x, y, z);

    // walls lean in, so their normals tip upwards; the scoop tips the top towards the middle
    nn.set(
      d.x - capDishSlope(x, w) * top * top,
      d.y + Math.abs(d.x) * (CAP.inset / CAP.h) + Math.abs(d.z) * (lean / CAP.h),
      d.z,
    ).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);

    // project the grain from whichever side the vertex faces, in real units so wide keys are not stretched
    const ax = Math.abs(d.x);
    const ay = Math.abs(d.y);
    const az = Math.abs(d.z);
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  p.needsUpdate = true;
  capCache.set(w, g);
  return g;
}

/** A flat plane laid on the scooped top of a cap of width `w`, for legends. Built already lying flat. */
export function dishedPlane(width: number, depth: number, w: number, offsetZ = 0, segments = 12) {
  const g = new THREE.PlaneGeometry(width, depth, segments, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, offsetZ);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, CAP.h / 2 + capDish(x, w) + 0.004);
    nn.set(-capDishSlope(x, w), 1, 0).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);
  }
  return g;
}

/** Traces a rounded rectangle centred on (cx, cy) into a shape or hole path. */
export function roundedRect(path: THREE.Path, w: number, h: number, r: number, cx = 0, cy = 0) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
}

/**
 * Moves the sloped faces of an extrusion that point up (`facing` 1) or down (-1) into their own material
 * group (index 2), so that edge can be cut bright like the diamond-cut chamfer on a machined case.
 * Groups 0 (top and bottom) and 1 (walls) stay.
 */
function splitChamfer(g: THREE.BufferGeometry, facing: 1 | -1) {
  const src = g.index ? g.toNonIndexed() : g;
  const names = Object.keys(src.attributes);
  const buckets: number[][] = [[], [], []];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const pos = src.attributes.position;
  for (const grp of src.groups) {
    for (let v = grp.start; v < grp.start + grp.count; v += 3) {
      let slot = grp.materialIndex ?? 0;
      if (slot === 1) {
        a.fromBufferAttribute(pos, v);
        b.fromBufferAttribute(pos, v + 1);
        c.fromBufferAttribute(pos, v + 2);
        const ny = b.sub(a).cross(c.sub(a)).normalize().y * facing;
        if (ny > 0.3 && ny < 0.95) slot = 2;
      }
      buckets[slot].push(v);
    }
  }
  const out = new THREE.BufferGeometry();
  const order = buckets.flat();
  for (const name of names) {
    const attr = src.attributes[name] as THREE.BufferAttribute;
    const size = attr.itemSize;
    const arr = new Float32Array(order.length * 3 * size);
    order.forEach((start, k) => {
      for (let j = 0; j < 3; j++) {
        for (let s = 0; s < size; s++) arr[(k * 3 + j) * size + s] = attr.array[(start + j) * size + s];
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  let start = 0;
  buckets.forEach((list, i) => {
    out.addGroup(start, list.length * 3, i);
    start += list.length * 3;
  });
  return out;
}

/**
 * Extruded rounded slab (optionally a ring) lying flat, its base at y = 0. With `chamfer`, the edges are
 * cut at 45 degrees, and the ones on the `polish` side (1 top, -1 bottom) go in material group 2.
 */
export function slabGeometry(
  w: number,
  d: number,
  r: number,
  height: number,
  hole?: { w: number; d: number; r: number },
  chamfer = 0,
  polish: 1 | -1 = 1,
) {
  const shape = new THREE.Shape();
  roundedRect(shape, w, d, r);
  if (hole) {
    const h = new THREE.Path();
    roundedRect(h, hole.w, hole.d, hole.r);
    shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: chamfer || 0.05,
    bevelSize: chamfer || 0.05,
    bevelSegments: chamfer ? 1 : 4,
    curveSegments: 20,
  });
  g.rotateX(-Math.PI / 2);
  return chamfer ? splitChamfer(g, polish) : g;
}

/** Switch cutouts (14 mm square) and stabiliser slots, as seen from above. Shape y is world -z. */
const SWITCH_HOLE = 0.74;
export const stabOffset = (w: number) => (w >= 6 ? 2.625 : 0.625);

export function plateShape(keys: KeyDef[], w: number, d: number) {
  const shape = new THREE.Shape();
  roundedRect(shape, w, d, 0.08);
  const cut = (cx: number, cy: number, hw: number, hd: number, r: number) => {
    const h = new THREE.Path();
    roundedRect(h, hw, hd, r, cx, cy);
    shape.holes.push(h);
  };
  keys.forEach((k) => {
    cut(k.x, -k.z, SWITCH_HOLE, SWITCH_HOLE, 0.03);
    if (k.w >= 2) {
      const o = stabOffset(k.w);
      cut(k.x - o, -k.z - 0.04, 0.34, 0.66, 0.05);
      cut(k.x + o, -k.z - 0.04, 0.34, 0.66, 0.05);
    }
  });
  return shape;
}

export function plateGeometry(keys: KeyDef[], w: number, d: number, thickness: number) {
  const g = new THREE.ExtrudeGeometry(plateShape(keys, w, d), { depth: thickness, bevelEnabled: false, curveSegments: 3 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Square frustum, flat-shaded: the body of a switch housing. */
function frustum(bottom: number, top: number, height: number) {
  const g = new THREE.CylinderGeometry(top / Math.SQRT2, bottom / Math.SQRT2, height, 4, 1).toNonIndexed();
  g.rotateY(Math.PI / 4);
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return g;
}

const plain = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  return out;
};

/** Parts of an MX-style switch, centred on the switch, with y = 0 at the top of the plate. */
export function switchGeometries() {
  // lower housing sits under the plate; the centre post and the two PCB pegs hang below it
  const lower = mergeGeometries([
    frustum(0.7, 0.72, 0.25).translate(0, -0.125, 0),
    plain(new THREE.CylinderGeometry(0.075, 0.06, 0.08, 16)).translate(0, -0.29, 0),
    plain(new THREE.CylinderGeometry(0.03, 0.025, 0.06, 10)).translate(-0.27, -0.28, 0),
    plain(new THREE.CylinderGeometry(0.03, 0.025, 0.06, 10)).translate(0.27, -0.28, 0),
  ])!;
  // the clear upper housing above the plate, with a raised rim around the stem
  const upper = mergeGeometries([
    frustum(0.78, 0.6, 0.22).translate(0, 0.11, 0),
    frustum(0.4, 0.36, 0.03).translate(0, 0.235, 0),
  ])!;
  // the cross-shaped stem that the keycap pushes onto
  const stem = mergeGeometries([
    plain(new THREE.BoxGeometry(0.22, 0.17, 0.075)),
    plain(new THREE.BoxGeometry(0.075, 0.17, 0.22)),
    plain(new THREE.BoxGeometry(0.3, 0.06, 0.3)).translate(0, -0.1, 0),
  ])!.translate(0, 0.33, 0);
  // gold contact pins, where MX pins sit
  const pins = mergeGeometries([
    plain(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8)).translate(-0.2, -0.32, -0.133),
    plain(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8)).translate(0.133, -0.32, -0.267),
  ])!;
  return { lower, upper, stem, pins };
}

/** A plate-mount stabiliser housing: a small block with its own stem slot. */
export function stabGeometry() {
  return mergeGeometries([
    frustum(0.3, 0.26, 0.2).translate(0, 0.1, 0),
    plain(new THREE.BoxGeometry(0.16, 0.12, 0.16)).translate(0, 0.24, 0),
    plain(new THREE.BoxGeometry(0.22, 0.24, 0.5)).translate(0, -0.12, 0),
  ])!;
}
