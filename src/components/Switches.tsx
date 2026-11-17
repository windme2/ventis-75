'use client';

import { SWITCHES, type SwitchType } from '@/lib/store';

const MAX_G = 100;

/** Force (g) against travel (mm), with the actuation point marked. */
export function ForceCurve({ sw, large = false }: { sw: SwitchType; large?: boolean }) {
  const W = 260;
  const H = 130;
  const L = 30;
  const R = 10;
  const T = 12;
  const B = 24;
  const x = (mm: number) => L + (mm / sw.travel) * (W - L - R);
  const y = (g: number) => T + (1 - g / MAX_G) * (H - T - B);
  const line = sw.curve.map(([mm, g], i) => `${i ? 'L' : 'M'}${x(mm).toFixed(1)},${y(g).toFixed(1)}`).join(' ');
  const area = `${line} L${x(sw.travel)},${y(0)} L${x(0)},${y(0)} Z`;
  const ax = x(sw.actuation);
  const ay = y(sw.force);

  return (
    <figure className={large ? 'curve large' : 'curve'}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${sw.name} switch force curve`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line className="grid" x1={L} x2={W - R} y1={y(g)} y2={y(g)} />
            <text className="tick" x={L - 6} y={y(g) + 3} textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        <text className="tick" x={L} y={H - 6}>
          0 mm
        </text>
        <text className="tick" x={W - R} y={H - 6} textAnchor="end">
          {sw.travel} mm
        </text>
        <g key={sw.id}>
          <path className="area" d={area} style={{ fill: sw.color }} />
          <path className="line" d={line} pathLength={1} style={{ stroke: sw.color }} />
          <line className="act" x1={ax} x2={ax} y1={T} y2={y(0)} />
          <circle className="dot" cx={ax} cy={ay} r={4} style={{ fill: sw.color }} />
          <text className="tick strong" x={ax - 7} y={T + 8} textAnchor="end">
            actuates {sw.actuation} mm · {sw.force} g
          </text>
        </g>
      </svg>
    </figure>
  );
}

export function SwitchPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div className="switches" role="group" aria-label="Switch">
      {SWITCHES.map((s, i) => (
        <button key={s.id} type="button" aria-pressed={i === value} onClick={() => onChange(i)}>
          <i style={{ background: s.color }} aria-hidden />
          <span>
            {s.name}
            <small>{s.kind}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
