import { ImageResponse } from 'next/og';
import { BOARD, KEYS } from '@/components/keyboard/layout';
import { COLORWAYS } from '@/lib/store';

export const alt = 'Ventis-75, a 75% aluminium mechanical keyboard, drawn in the Basalt finish';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const U = 44; // px per key unit
const GAP = 3;
const RIM = 20;

/** The share card: the wordmark over a flat drawing of the board in the default finish. */
export default function Image() {
  const c = COLORWAYS[0];
  const w = BOARD.w * U + RIM * 2;
  const h = BOARD.d * U + RIM * 2;
  const z0 = KEYS[0].z;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          color: '#fff',
          background: `radial-gradient(circle at 50% 70%, #50565e 0%, ${c.backdrop} 55%, #2a2e33 100%)`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -5, lineHeight: 1 }}>Ventis-75</div>
            <div style={{ fontSize: 30, marginTop: 14, color: 'rgba(255,255,255,0.8)' }}>
              A keyboard you can type on, pull apart and refinish in the browser.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              marginTop: 18,
              padding: '8px 18px',
              borderRadius: 999,
              background: c.accent,
              color: c.legendAccent,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            75% · gasket · hot-swap
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              width: w,
              height: h,
              borderRadius: 22,
              background: c.case,
              boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
            }}
          >
            {KEYS.map((k) => (
              <div
                key={k.id}
                style={{
                  position: 'absolute',
                  display: 'flex',
                  left: RIM + (k.x + BOARD.w / 2 - k.w / 2) * U + GAP,
                  top: RIM + (k.z - z0) * U + GAP,
                  width: k.w * U - GAP * 2,
                  height: U - GAP * 2,
                  borderRadius: 6,
                  background: c[k.kind],
                  boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.25)',
                  padding: '4px 6px',
                  fontSize: k.label.length > 1 ? 9 : 13,
                  fontWeight: 600,
                  color: k.kind === 'alpha' ? c.legendAlpha : k.kind === 'mod' ? c.legendMod : c.legendAccent,
                }}
              >
                {k.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
