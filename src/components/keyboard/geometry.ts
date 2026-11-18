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

const COLS = 16;
const CELL = 128;

/** One texture holding every legend, white on transparent; materials tint it. */
export function buildLegendAtlas(keys: KeyDef[]) {
  const rows = Math.ceil(keys.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  keys.forEach((k, i) => {
    if (!k.label) return;
    const cx = (i % COLS) * CELL + CELL / 2;
    const cy = Math.floor(i / COLS) * CELL + CELL / 2;
    const font = (size: number) => `600 ${size}px "Archivo Variable", "Helvetica Neue", Arial, sans-serif`;
    if (k.sub) {
      // shifted symbol on top, base character below
      ctx.font = font(40);
      ctx.fillText(k.sub, cx, cy - 22);
      ctx.font = font(46);
      ctx.fillText(k.label, cx, cy + 24);
      return;
    }
    const size = k.label.length === 1 ? 66 : k.label.length <= 3 ? 36 : 27;
    ctx.font = font(size);
    ctx.fillText(k.label, cx, cy + 3);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // each legend follows the scoop of its own cap, so it reads as moulded in rather than floating on top
  const geos = keys.map((k, i) => {
    const g = dishedPlane(0.62, 0.62, k.w, 0, 8);
    const u0 = (i % COLS) / COLS;
    const v1 = 1 - Math.floor(i / COLS) / rows;
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) {
      uv.setXY(j, u0 + uv.getX(j) / COLS, v1 - (1 - uv.getY(j)) / rows);
    }
    return g;
  });
  return { tex, geos };
}

function canvas2d(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

const repeat = (t: THREE.Texture) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/**
 * Fine random grain, used as a roughness and bump map: the bead-blasted finish of the case and the
 * slightly textured surface of PBT keycaps. Values stay high so it only breaks up the highlights.
 */
export function grainTexture() {
  const s = 256;
  const [c, ctx] = canvas2d(s, s);
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 190 + Math.random() * 65;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = repeat(new THREE.CanvasTexture(c));
  t.anisotropy = 4;
  return t;
}

/** Long horizontal streaks for the brushed plate. */
export function brushedTexture() {
  const s = 512;
  const [c, ctx] = canvas2d(s, s);
  ctx.fillStyle = 'rgb(150,150,150)';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 1400; i++) {
    const v = 110 + Math.random() * 120;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.5})`;
    const len = 60 + Math.random() * 400;
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillRect(x, y, len, 1);
    if (x + len > s) ctx.fillRect(x - s, y, len, 1);
  }
  const t = repeat(new THREE.CanvasTexture(c));
  t.anisotropy = 8;
  return t;
}

/**
 * The circuit board's top side, drawn to scale: solder mask, copper traces under it, gold pads for the
 * switch pins, a diode and silkscreen outline per switch, stabiliser holes and the board's name.
 * Returns a colour map and a matching metalness map (only the pads are metal).
 */
export function pcbTextures(keys: KeyDef[], w: number, d: number) {
  const W = 2048;
  const H = Math.round((W * d) / w);
  const u = W / w;
  const px = (x: number) => ((x + w / 2) / w) * W;
  const pz = (z: number) => ((z + d / 2) / d) * H;
  const [c, ctx] = canvas2d(W, H);
  const [mc, mx] = canvas2d(W, H);

  ctx.fillStyle = '#0c271c';
  ctx.fillRect(0, 0, W, H);
  mx.fillStyle = '#000';
  mx.fillRect(0, 0, W, H);

  // copper under the mask shows as slightly lighter lines
  ctx.strokeStyle = '#174a35';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.028 * u;
  const rows = new Map<number, KeyDef[]>();
  keys.forEach((k) => rows.set(k.row, [...(rows.get(k.row) ?? []), k]));
  rows.forEach((list) => {
    const z = list[0].z + 0.43;
    const xs = list.map((k) => k.x);
    ctx.beginPath();
    ctx.moveTo(px(Math.min(...xs) - 0.3), pz(z));
    ctx.lineTo(px(Math.max(...xs) + 0.45), pz(z));
    ctx.stroke();
  });
  keys.forEach((k) => {
    // row: diode down to the row line at 45 degrees
    ctx.beginPath();
    ctx.moveTo(px(k.x + 0.3), pz(k.z + 0.31));
    ctx.lineTo(px(k.x + 0.3), pz(k.z + 0.36));
    ctx.lineTo(px(k.x + 0.37), pz(k.z + 0.43));
    ctx.stroke();
    // column: from the pin up and over towards the key above
    ctx.beginPath();
    ctx.moveTo(px(k.x - 0.2), pz(k.z - 0.133));
    ctx.lineTo(px(k.x - 0.2), pz(k.z - 0.4));
    ctx.lineTo(px(k.x - 0.32), pz(k.z - 0.52));
    ctx.lineTo(px(k.x - 0.32), pz(k.z - 0.62));
    ctx.stroke();
    // the other pin to the diode
    ctx.beginPath();
    ctx.moveTo(px(k.x + 0.133), pz(k.z - 0.267));
    ctx.lineTo(px(k.x + 0.3), pz(k.z - 0.1));
    ctx.lineTo(px(k.x + 0.3), pz(k.z + 0.09));
    ctx.stroke();
  });

  // vias
  ctx.fillStyle = '#1d5a40';
  keys.forEach((k) => {
    ctx.beginPath();
    ctx.arc(px(k.x - 0.32), pz(k.z - 0.62), 0.03 * u, 0, Math.PI * 2);
    ctx.fill();
  });

  const circle = (g: CanvasRenderingContext2D, x: number, z: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(px(x), pz(z), r * u, 0, Math.PI * 2);
    g.fill();
  };
  const silk = '#dfe9e2';
  ctx.font = `600 ${Math.round(0.075 * u)}px "Archivo Variable", Arial, sans-serif`;
  ctx.textBaseline = 'top';

  keys.forEach((k, i) => {
    const half = 0.39;
    // silkscreen outline with open corners, like a real footprint
    ctx.strokeStyle = silk;
    ctx.lineWidth = 0.012 * u;
    ctx.setLineDash([0.5 * u, 0.28 * u]);
    ctx.lineDashOffset = -0.14 * u;
    ctx.strokeRect(px(k.x - half), pz(k.z - half), 2 * half * u, 2 * half * u);
    ctx.setLineDash([]);
    ctx.fillStyle = silk;
    ctx.fillText(`SW${i + 1}`, px(k.x - 0.35), pz(k.z - 0.36));

    // plated holes for the switch pins: gold ring, dark hole
    for (const [x, z] of [
      [-0.2, -0.133],
      [0.133, -0.267],
    ]) {
      circle(ctx, k.x + x, k.z + z, 0.065, '#c8a04c');
      circle(mx, k.x + x, k.z + z, 0.065, '#fff');
      circle(ctx, k.x + x, k.z + z, 0.03, '#050806');
      circle(mx, k.x + x, k.z + z, 0.03, '#000');
    }
    // centre post and the two peg holes
    circle(ctx, k.x, k.z, 0.1, '#040605');
    circle(ctx, k.x - 0.27, k.z, 0.045, '#040605');
    circle(ctx, k.x + 0.27, k.z, 0.045, '#040605');

    // diode: black body between two gold pads, with its label
    const dx = px(k.x + 0.3);
    const dz = pz(k.z + 0.2);
    ctx.fillStyle = '#c8a04c';
    ctx.fillRect(dx - 0.04 * u, dz - 0.12 * u, 0.08 * u, 0.24 * u);
    mx.fillStyle = '#fff';
    mx.fillRect(dx - 0.04 * u, dz - 0.12 * u, 0.08 * u, 0.24 * u);
    ctx.fillStyle = '#121314';
    ctx.fillRect(dx - 0.045 * u, dz - 0.075 * u, 0.09 * u, 0.15 * u);
    mx.fillStyle = '#000';
    mx.fillRect(dx - 0.045 * u, dz - 0.075 * u, 0.09 * u, 0.15 * u);
    ctx.fillStyle = silk;
    ctx.fillRect(dx - 0.045 * u, dz + 0.05 * u, 0.09 * u, 0.012 * u);

    // stabiliser holes on the long keys
    if (k.w >= 2) {
      const o = stabOffset(k.w);
      for (const s of [-1, 1]) {
        circle(ctx, k.x + s * o, k.z - 0.3, 0.06, '#040605');
        circle(ctx, k.x + s * o, k.z + 0.42, 0.075, '#040605');
      }
    }
  });

  // mounting holes, gold-ringed
  for (const [x, z] of [
    [-7.6, -2.75],
    [7.6, -2.75],
    [-7.6, 2.75],
    [7.6, 2.75],
    [0, 0.06],
  ]) {
    circle(ctx, x, z, 0.12, '#c8a04c');
    circle(mx, x, z, 0.12, '#fff');
    circle(ctx, x, z, 0.075, '#040605');
    circle(mx, x, z, 0.075, '#000');
  }

  // the board name sits in the gap between the F-row and the number row
  const fz = keys[0].z + 0.5 + 0.125;
  ctx.fillStyle = silk;
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(0.13 * u)}px "Archivo Variable", Arial, sans-serif`;
  ctx.fillText('VENTIS-75  REV 1.2', px(-7.6), pz(fz));
  ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(0.1 * u)}px "Archivo Variable", Arial, sans-serif`;
  ctx.fillText('HOT-SWAP · SOUTH LED · 2026', px(7.6), pz(fz));

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const metal = new THREE.CanvasTexture(mc);
  metal.anisotropy = 8;
  return { map, metal };
}

/** Fine vertical ridges for the knob's knurled side. */
export function knurlTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 16, 0);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.5, '#fff');
  grad.addColorStop(1, '#000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(72, 1);
  return t;
}

export function engravingTexture(text: string, spacing = 0) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 54px "Archivo Variable", "Helvetica Neue", Arial, sans-serif';
  if (spacing) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, 512 + spacing / 2, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
