let ctx: AudioContext | null = null;
let enabled = true;
let noise: AudioBuffer | null = null;

export const setSoundEnabled = (v: boolean) => {
  enabled = v;
};

export type SwitchSound = 'red' | 'brown' | 'blue' | 'black';

/*
 * Real recordings first. Each file in /public/sounds is a sprite: eight single key presses, one per
 * 250 ms slot, cut from CC0 typing recordings on Freesound (credits in the README). To use your own,
 * replace a file with the same layout: mono, each press starting at the top of its 250 ms slot.
 */
const SLOT = 0.25;
const SOUNDS: SwitchSound[] = ['red', 'brown', 'blue', 'black'];
// Levels per switch, so a clicky Blue is louder than a quiet Red, as in real life.
const LEVEL: Record<SwitchSound, number> = { red: 0.55, brown: 0.6, blue: 0.75, black: 0.62 };
const samples: Partial<Record<SwitchSound, AudioBuffer>> = {};
// Some browsers (Safari) keep the MP3 encoder's leading silence, so measure where the audio really starts.
const lead: Partial<Record<SwitchSound, number>> = {};

function firstSound(buf: AudioBuffer) {
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) > 0.02) return Math.max(0, i / buf.sampleRate - 0.008); // each press starts 8 ms into its slot
  }
  return 0;
}
const lastSlot: Partial<Record<SwitchSound, number>> = {};
let loading = false;

/**
 * Fetches and decodes the samples ahead of the first key press. Decoding runs on an offline context,
 * so no audible context is created before the visitor interacts (browsers warn about that).
 */
export function preloadSounds() {
  if (loading || typeof window === 'undefined') return;
  loading = true;
  const Offline = window.OfflineAudioContext;
  if (!Offline) return;
  const decoder = new Offline(1, 1, 44100);
  SOUNDS.forEach(async (id) => {
    try {
      const res = await fetch(`/sounds/${id}.mp3`);
      if (!res.ok) return;
      const buf = await decoder.decodeAudioData(await res.arrayBuffer());
      lead[id] = Math.min(firstSound(buf), 0.06);
      samples[id] = buf;
    } catch {
      /* the synthesised sound covers for a missing file */
    }
  });
}

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A different press from the sprite each time, never the same one twice in a row. */
function pickSlot(id: SwitchSound, buf: AudioBuffer) {
  const n = Math.max(1, Math.round(buf.duration / SLOT));
  let s = Math.floor(Math.random() * n);
  if (n > 1 && s === lastSlot[id]) s = (s + 1) % n;
  lastSlot[id] = s;
  return s;
}

// Tone per switch: how much of the high end to take off. The recordings are close-miked, so the raw
// clicks are harsher than a board heard from where you sit. Blue keeps a little more, it is meant to click.
const SHELF: Record<SwitchSound, number> = { red: -7, brown: -7, blue: -4, black: -6 };

function playSample(
  ac: AudioContext,
  id: SwitchSound,
  buf: AudioBuffer,
  slot: number,
  rate: number,
  gain: number,
  release = false,
) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;

  // cut the room rumble under the key, which made the sound boomy
  const lowCut = ac.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = release ? 500 : 140;
  lowCut.Q.value = 0.6;

  // soften the top end, which made the sound piercing
  const shelf = ac.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 3500;
  shelf.gain.value = SHELF[id] - (release ? 3 : 0);

  const top = ac.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 9000;
  top.Q.value = 0.5;

  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(lowCut).connect(shelf).connect(top).connect(g).connect(ac.destination);
  src.start(ac.currentTime, (lead[id] ?? 0) + slot * SLOT, SLOT);
}

/**
 * Key press sound. Uses the recorded sample for the switch when it has loaded, otherwise the synthesised
 * one. Wider keys (Shift, Enter, the spacebar) play very slightly slower, a touch deeper, like the longer
 * caps on a real board.
 */
export function thock(width = 1, kind: SwitchSound = 'red') {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const ac = audio();
    const buf = samples[kind];
    if (!buf) return synth(ac, width, kind);
    const deep = width >= 6 ? 0.93 : width >= 2 ? 0.96 : 1;
    const rate = deep * (0.97 + Math.random() * 0.06);
    const gain = LEVEL[kind] * (0.88 + Math.random() * 0.12);
    playSample(ac, kind, buf, pickSlot(kind, buf), rate, gain);
  } catch {
    /* audio is optional */
  }
}

/** The lighter click a key makes on its way back up: the same recording, thinner and much quieter. */
export function release(width = 1, kind: SwitchSound = 'red') {
  if (!enabled || typeof window === 'undefined' || !ctx) return;
  const buf = samples[kind];
  if (!buf) return;
  try {
    const rate = (width >= 2 ? 0.98 : 1.03) * (0.97 + Math.random() * 0.06);
    playSample(ctx, kind, buf, pickSlot(kind, buf), rate, LEVEL[kind] * 0.16, true);
  } catch {
    /* audio is optional */
  }
}

/**
 * Fallback while the samples load: a filtered noise tick plus a short low thump. Brown adds a muted
 * tactile tick, Blue a bright click, and Black a lower, longer thump.
 */
function synth(ac: AudioContext, width: number, kind: SwitchSound) {
  const t = ac.currentTime;
  if (!noise) {
    const len = Math.floor(ac.sampleRate * 0.06);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const jitter = 0.9 + Math.random() * 0.2;
  const depth = 1 / Math.sqrt(width);
  const heavy = kind === 'black';

  const src = ac.createBufferSource();
  src.buffer = noise;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (heavy ? 850 : 1500) * jitter * depth;
  bp.Q.value = 0.9;
  const ng = ac.createGain();
  ng.gain.value = heavy ? 0.22 : 0.32;
  src.connect(bp).connect(ng).connect(ac.destination);
  src.start(t);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  const decay = heavy ? 0.16 : 0.09;
  osc.frequency.setValueAtTime((heavy ? 120 : 170) * jitter * depth, t);
  osc.frequency.exponentialRampToValueAtTime((heavy ? 48 : 70) * depth, t + decay * 0.8);
  const og = ac.createGain();
  og.gain.setValueAtTime(heavy ? 0.55 : 0.38, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + decay);
  osc.connect(og).connect(ac.destination);
  osc.start(t);
  osc.stop(t + decay + 0.01);

  if (kind === 'brown' || kind === 'blue') {
    const click = ac.createBufferSource();
    click.buffer = noise;
    click.playbackRate.value = kind === 'blue' ? 2.6 : 1.6;
    const hp = ac.createBiquadFilter();
    hp.type = kind === 'blue' ? 'highpass' : 'bandpass';
    hp.frequency.value = kind === 'blue' ? 3800 * jitter : 2400 * jitter;
    hp.Q.value = kind === 'blue' ? 0.7 : 1.4;
    const cg = ac.createGain();
    cg.gain.value = kind === 'blue' ? 0.55 : 0.16;
    click.connect(hp).connect(cg).connect(ac.destination);
    click.start(t);
  }
}
