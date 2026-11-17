import { KEYS } from '@/components/keyboard/layout';
import { release, thock, type SwitchSound } from './sound';

/** Values GSAP tweens and the render loop reads. Nothing here triggers React renders. */
export interface Pose {
  x: number; // fraction of viewport width
  y: number; // fraction of viewport height
  ny: number; // same, on narrow screens where the copy sits above the board
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  explode: number;
  desk: number; // 0..1, fades in the desk mat for the lifestyle shot
}

// One pose per page section, in document order.
export const POSES: Pose[] = [
  { x: 0.04, y: -0.17, ny: 0.0, rx: 0.9, ry: -0.42, rz: 0, scale: 0.8, explode: 0, desk: 0 }, // hero
  { x: 0, y: -0.29, ny: -0.3, rx: 1.2, ry: 0, rz: 0, scale: 0.88, explode: 0, desk: 0 }, // typing
  { x: -0.2, y: -0.02, ny: -0.32, rx: 0.78, ry: 0.42, rz: 0, scale: 0.7, explode: 0.45, desk: 0 }, // switches
  { x: 0.17, y: -0.1, ny: -0.38, rx: 0.5, ry: -0.6, rz: 0, scale: 0.68, explode: 1, desk: 0 }, // layers
  { x: -0.17, y: 0, ny: -0.2, rx: 0.85, ry: 0.5, rz: 0, scale: 0.78, explode: 0, desk: 0 }, // finishes
  { x: 0.17, y: 0, ny: -0.15, rx: -2.15, ry: 0.3, rz: 0, scale: 0.78, explode: 0, desk: 0 }, // underside
  { x: 0.17, y: -0.06, ny: -0.3, rx: 0.42, ry: -0.42, rz: 0, scale: 0.72, explode: 0, desk: 1 }, // desk
  { x: 0.2, y: 0.02, ny: -0.34, rx: 1.05, ry: -0.2, rz: 0.04, scale: 0.7, explode: 0, desk: 0 }, // specs
];

export const rig: Pose = { ...POSES[0] };

/** Added on top of the pose so the load animation never fights the scroll scrub. */
export const intro = { rx: 0, ry: 0, scale: 1 };

// `sounded` remembers whether the press made a sound, so the release only clicks when the press did.
export const keyState = KEYS.map(() => ({ press: 0, target: 0, drop: 1, sounded: false }));

export const knob = { turns: 0 };

/** Which exploded layer the visitor is pointing at in the parts list (-1 = none). Order matches LAYERS. */
export const focus = { layer: -1 };

/** Extra brightness on the under-key glow, tweened when the typing test ends. */
export const glow = { boost: 0 };

/** Drag-to-turn in the Finishes section. `target` follows the pointer, the rig eases towards it. */
export const spin = { enabled: false, target: 0, value: 0 };

/** Presses every key in a sweep from left to right, silently. Used on load and on finish change. */
export function wave(delay = 0, schedule: (t: number, fn: () => void) => void = (t, fn) => setTimeout(fn, t * 1000)) {
  KEYS.forEach((k) => schedule(delay + (k.x + 8) * 0.04 + k.row * 0.025, () => pressKey(k.id, { sound: false })));
}

export const ripples = Array.from({ length: 6 }, () => ({ x: 0, y: 0, t: -100 }));
let rippleHead = 0;
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
export const now = () => (performance.now() - t0) / 1000;

export function pressKey(i: number, opts: { sound?: boolean; hold?: boolean } = {}) {
  const s = keyState[i];
  if (!s) return;
  s.target = 1;
  const k = KEYS[i];
  const r = ripples[rippleHead];
  rippleHead = (rippleHead + 1) % ripples.length;
  r.x = k.x;
  r.y = -k.z;
  r.t = now();
  s.sounded = opts.sound !== false;
  if (s.sounded) thock(k.w, SWITCHES[switchState.index].id);
  if (!opts.hold) setTimeout(() => releaseKey(i), 110);
}

export function releaseKey(i: number) {
  const s = keyState[i];
  if (!s) return;
  if (s.target > 0 && s.sounded) release(KEYS[i].w, SWITCHES[switchState.index].id);
  s.target = 0;
  s.sounded = false;
}

export interface SwitchType {
  id: SwitchSound;
  name: string;
  kind: 'Linear' | 'Tactile' | 'Clicky' | 'Heavy linear';
  color: string;
  force: number; // grams at actuation
  actuation: number; // mm
  travel: number; // mm
  feel: string;
  /** Force curve as [travel mm, grams], drawn in the Switches section. */
  curve: [number, number][];
}

export const SWITCHES: SwitchType[] = [
  {
    id: 'red',
    name: 'Red',
    kind: 'Linear',
    color: '#e0343c',
    force: 45,
    actuation: 2.0,
    travel: 4.0,
    feel: 'Smooth from top to bottom, with no bump and no click. Quiet and quick.',
    curve: [[0, 0], [0.05, 30], [2.0, 45], [3.6, 58], [3.85, 72], [4, 85]],
  },
  {
    id: 'brown',
    name: 'Brown',
    kind: 'Tactile',
    color: '#8b5a36',
    force: 55,
    actuation: 2.0,
    travel: 4.0,
    feel: 'A soft bump just before the key registers, and no click. A good all-rounder for typing.',
    curve: [[0, 0], [0.05, 35], [1.2, 55], [2.0, 44], [3.6, 62], [3.85, 76], [4, 88]],
  },
  {
    id: 'blue',
    name: 'Blue',
    kind: 'Clicky',
    color: '#2f80e8',
    force: 60,
    actuation: 2.2,
    travel: 4.0,
    feel: 'A sharp bump with an audible click at the actuation point. Satisfying, and loud.',
    curve: [[0, 0], [0.05, 38], [1.7, 60], [2.2, 40], [3.6, 64], [3.85, 78], [4, 90]],
  },
  {
    id: 'black',
    name: 'Black',
    kind: 'Heavy linear',
    color: '#2a2c31',
    force: 62,
    actuation: 2.0,
    travel: 4.0,
    feel: 'A long spring and a thick housing. Heavier to press, with a low, rounded thock at the bottom.',
    curve: [[0, 0], [0.05, 45], [2.0, 62], [3.6, 76], [3.85, 90], [4, 100]],
  },
];

export const switchState = { index: 0 };

export interface Colorway {
  id: string;
  name: string;
  note: string;
  backdrop: string;
  case: string;
  alpha: string;
  mod: string;
  accent: string;
  legendAlpha: string;
  legendMod: string;
  legendAccent: string;
  plate: string;
  glowA: string;
  glowB: string;
}

// The first entry is the finish the page opens with.
export const COLORWAYS: Colorway[] = [
  {
    id: 'basalt',
    name: 'Basalt',
    note: 'Black anodised case, two greys, sea-green Esc and Enter, brass plate.',
    backdrop: '#3b4046',
    case: '#17181b',
    alpha: '#4a4e55',
    mod: '#26282d',
    accent: '#35d0a4',
    legendAlpha: '#e8ebef',
    legendMod: '#9aa1ab',
    legendAccent: '#06251c',
    plate: '#b8934b',
    glowA: '#35d0a4',
    glowB: '#bff7e6',
  },
  {
    id: 'signal',
    name: 'Signal',
    note: 'Bead-blasted silver case, white caps, ultramarine modifiers, yellow Esc and Enter.',
    backdrop: '#1d2cc4',
    case: '#c9ced6',
    alpha: '#f1f1ee',
    mod: '#2337d8',
    accent: '#ffd21f',
    legendAlpha: '#1b1e2b',
    legendMod: '#f1f1ee',
    legendAccent: '#1b1e2b',
    plate: '#d7dbe2',
    glowA: '#ffffff',
    glowB: '#ffd21f',
  },
  {
    id: 'persimmon',
    name: 'Persimmon',
    note: 'Ivory powder-coated case, ivory caps, persimmon modifiers, ink-blue Esc and Enter.',
    backdrop: '#c8401b',
    case: '#ece6d8',
    alpha: '#f4efe4',
    mod: '#e2532b',
    accent: '#1e2a4a',
    legendAlpha: '#3a2a22',
    legendMod: '#fff4ea',
    legendAccent: '#f4efe4',
    plate: '#e8e2d2',
    glowA: '#ffe7c2',
    glowB: '#ffffff',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    note: 'Blush powder-coated case, cream caps, petal-pink modifiers, plum Esc and Enter.',
    backdrop: '#b84f72',
    case: '#f2dfe3',
    alpha: '#fbf4ef',
    mod: '#eba9bb',
    accent: '#6b2541',
    legendAlpha: '#6b2541',
    legendMod: '#5a1f37',
    legendAccent: '#fbe7ee',
    plate: '#ead6da',
    glowA: '#ffd3e0',
    glowB: '#ffffff',
  },
];
