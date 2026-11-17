'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { BOARD, KEYS, KNOB } from './keyboard/layout';
import { keyState, rig, type Colorway } from '@/lib/store';

const U = 40; // px per key unit
const GAP = 3;
const RIM = 18;
const W = BOARD.w * U + RIM * 2;
const H = BOARD.d * U + RIM * 2;
const ox = RIM + (BOARD.w / 2) * U;
const oz = RIM + U / 2 - KEYS[0].z * U;

/**
 * A flat drawing of the board for devices without WebGL. It follows the same scroll poses as the 3D
 * board (position, tilt and scale) and its keys still go down when you type.
 */
export default function Fallback({ colorway: c, accents }: { colorway: Colorway; accents: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const caps = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const tick = () => {
      const el = root.current;
      if (!el) return;
      const narrow = window.innerWidth < 900;
      const x = narrow ? 0 : rig.x * window.innerWidth;
      const y = -(narrow ? rig.ny : rig.y) * window.innerHeight;
      // CSS has no back face to show, so the flip for the underside becomes a gentle tilt instead
      const tilt = Math.min(Math.abs(rig.rx), 1.2) * 38;
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) perspective(1600px) rotateX(${tilt}deg) rotateZ(${-rig.ry * 6}deg) scale(${Math.min(rig.scale, narrow ? 0.9 : 1)})`;
      caps.current.forEach((g, i) => g?.classList.toggle('is-down', keyState[i].target > 0));
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  const fill = (kind: 'alpha' | 'mod' | 'accent') => (kind === 'accent' && !accents ? c.mod : c[kind]);
  const ink = (kind: 'alpha' | 'mod' | 'accent') =>
    kind === 'alpha' ? c.legendAlpha : kind === 'accent' && accents ? c.legendAccent : c.legendMod;

  return (
    <div className="fallback" ref={root} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} rx={22} fill={c.case} />
        <rect x={RIM - 6} y={RIM - 6} width={W - RIM * 2 + 12} height={H - RIM * 2 + 12} rx={8} fill="rgb(0 0 0 / 0.35)" />
        {KEYS.map((k, i) => {
          const w = k.w * U - GAP * 2;
          const x = ox + k.x * U - w / 2;
          const y = oz + k.z * U - U / 2 + GAP;
          return (
            <g
              key={k.id}
              className="fb-key"
              ref={(el) => {
                caps.current[i] = el;
              }}
            >
              <rect x={x} y={y} width={w} height={U - GAP * 2} rx={5} fill={fill(k.kind)} />
              <rect x={x + 3} y={y + 2} width={w - 6} height={U - GAP * 2 - 9} rx={4} fill="rgb(255 255 255 / 0.07)" />
              {k.label && (
                <text x={x + 7} y={y + 15} fill={ink(k.kind)} fontSize={k.label.length > 1 ? 8 : 12} fontWeight={600}>
                  {k.label}
                </text>
              )}
            </g>
          );
        })}
        <circle cx={ox + KNOB.x * U} cy={oz + KNOB.z * U} r={15} fill={c.case} stroke="rgb(0 0 0 / 0.35)" strokeWidth={3} />
      </svg>
      <p>3D view isn&apos;t available on this device, so here is a flat drawing of the board.</p>
    </div>
  );
}
