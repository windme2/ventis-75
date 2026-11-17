'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

// Keep the counter on screen long enough to read, even when everything is cached.
const MIN_SHOW = 1.3;

interface Props {
  /** True once the 3D scene has drawn its first frame. */
  ready: boolean;
  /** Called as the curtain starts to lift, so the page intro can begin underneath. */
  onReveal: () => void;
}

/**
 * Full-screen counter shown before the page. It creeps towards 90 on its own while the scene is
 * being built, and only completes to 100 once the scene is really ready.
 */
export default function Loader({ ready, onReveal }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const value = useRef({ v: 0 });
  const creep = useRef<gsap.core.Tween | null>(null);
  const started = useRef(0);

  const render = () => {
    const v = Math.round(value.current.v);
    if (num.current) num.current.textContent = String(v).padStart(3, '0');
    if (bar.current) bar.current.style.transform = `scaleX(${v / 100})`;
  };

  useGSAP(
    () => {
      started.current = performance.now();
      document.documentElement.classList.add('is-loading');
      creep.current = gsap.to(value.current, { v: 90, duration: 2.6, ease: 'power2.out', onUpdate: render });
    },
    { scope: root },
  );

  useEffect(() => {
    if (!ready || !root.current) return;
    creep.current?.kill();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const waited = (performance.now() - started.current) / 1000;
    const finish = Math.max(0.45, MIN_SHOW - waited);
    const el = root.current;
    const done = () => {
      el.style.display = 'none';
      document.documentElement.classList.remove('is-loading');
    };

    const tl = gsap.timeline({ onComplete: done });
    tl.to(value.current, { v: 100, duration: finish, ease: 'power2.inOut', onUpdate: render });
    if (reduced) {
      tl.add(onReveal).to(el, { autoAlpha: 0, duration: 0.3 });
    } else {
      tl.to(el.querySelectorAll('.loader-num, .loader-meta'), {
        yPercent: -60,
        autoAlpha: 0,
        duration: 0.55,
        ease: 'power3.in',
        stagger: 0.05,
        delay: 0.15,
      })
        .add(onReveal, '-=0.1')
        .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.9, ease: 'expo.inOut' }, '<');
    }
    return () => {
      tl.kill();
    };
  }, [ready, onReveal]);

  return (
    <div ref={root} className="loader" role="progressbar" aria-label="Loading Ventis-75" aria-busy={!ready}>
      <div className="loader-meta">
        <span>Ventis-75</span>
      </div>
      <span className="loader-num" ref={num} aria-hidden>
        000
      </span>
      <span className="loader-bar" aria-hidden>
        <span ref={bar} />
      </span>
    </div>
  );
}
