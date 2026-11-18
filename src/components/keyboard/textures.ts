import * as THREE from 'three';
import { dishedPlane, stabOffset } from './geometry';
import type { KeyDef } from './layout';

// Textures for the board, all drawn on canvases at runtime: no image files to download.

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
