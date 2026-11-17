import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { KeyDef } from './layout';

export const CAP = { h: 0.42, d: 0.94, gap: 0.06, inset: 0.1 };

const capCache = new Map<number, THREE.BufferGeometry>();

/** Rounded box tapered towards the top, like a Cherry-profile cap. */
export function keycapGeometry(w: number) {
  const hit = capCache.get(w);
  if (hit) return hit;
  const cw = w - CAP.gap;
  const g = new RoundedBoxGeometry(cw, CAP.h, CAP.d, 5, 0.075);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + CAP.h / 2) / CAP.h;
    p.setX(i, p.getX(i) * ((cw / 2 - CAP.inset * t) / (cw / 2)));
    // the back face leans in more than the front one
    const z = p.getZ(i);
    const lean = z < 0 ? CAP.inset * 1.3 : CAP.inset * 0.7;
    p.setZ(i, z * ((CAP.d / 2 - lean * t) / (CAP.d / 2)));
  }
  p.needsUpdate = true;
  capCache.set(w, g);
  return g;
}

function roundedRect(path: THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
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

/** Extruded rounded slab (optionally a ring) lying flat, its base at y = 0. */
export function slabGeometry(
  w: number,
  d: number,
  r: number,
  height: number,
  hole?: { w: number; d: number; r: number },
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
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 4,
    curveSegments: 20,
  });
  g.rotateX(-Math.PI / 2);
  return g;
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

  const geos = keys.map((_, i) => {
    const g = new THREE.PlaneGeometry(0.62, 0.62);
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
