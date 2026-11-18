"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CODE_INDEX, KEYS } from "./keyboard/layout";
import {
  COLORWAYS,
  POSES,
  SWITCHES,
  focus,
  glow,
  intro,
  keyState,
  knob,
  pressKey,
  releaseKey,
  rig,
  spin,
  switchState,
  wave,
} from "@/lib/store";
import { ForceCurve, SwitchPicker } from "./Switches";
import Loader from "./Loader";
import Fallback from "./Fallback";
import GLBoundary from "./GLBoundary";
import {
  hasWebGL,
  isTouchScreen,
  prefersReducedMotion,
  storage,
} from "@/lib/browser";
import { preloadSounds, setSoundEnabled } from "@/lib/sound";
import { SITE } from "@/lib/site";
import {
  BACKSPACE,
  charState,
  newTest,
  typeInto,
  type SpeedTest,
} from "@/lib/speedTest";
import {
  HIGHLIGHTS,
  LAYERS,
  SECTIONS,
  SPECS,
  TITLE,
  UNDERSIDE,
} from "@/lib/content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const pad = (n: number) => String(n).padStart(2, "0");

/** The character a tapped 3D key stands for in the readout, if any. */
const charFor = (i: number) => {
  const k = KEYS[i];
  if (k.code === "Space") return " ";
  if (k.code === "Backspace") return BACKSPACE;
  return k.label.length === 1 ? k.label.toLowerCase() : null;
};

/** The 3D key that types a character, used when typing through the phone keyboard. */
const keyFor = (ch: string) => {
  if (ch === " ") return CODE_INDEX.Space;
  const k = KEYS.find(
    (k) =>
      k.label.length === 1 &&
      (k.label.toLowerCase() === ch.toLowerCase() || k.sub === ch),
  );
  return k?.id;
};

interface Glyph {
  id: number;
  ch: string;
}


export default function Experience() {
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const testInput = useRef<HTMLInputElement>(null);
  const typing = useRef(false);
  const testing = useRef(false);
  const glyphId = useRef(0);
  const stamps = useRef<number[]>([]);
  const firstFinish = useRef(true);
  const lastSentence = useRef(-1);
  const [cw, setCw] = useState(0);
  const [sw, setSw] = useState(0);
  const [accents, setAccents] = useState(true);
  const [fonts, setFonts] = useState(false);
  const [gl, setGl] = useState<boolean | null>(null);
  const [touch, setTouch] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const introTl = useRef<gsap.core.Timeline | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onReveal = useCallback(() => setRevealed(true), []);
  const onGLFail = useCallback(() => setGl(false), []);
  const [sound, setSound] = useState(true);
  const [hint, setHint] = useState(false);
  const [typed, setTyped] = useState<Glyph[]>([]);
  const [stats, setStats] = useState({ keys: 0, wpm: 0, last: "" });
  const [test, setTest] = useState<SpeedTest | null>(null);
  const colorway = COLORWAYS[cw];
  const switchType = SWITCHES[sw];

  const chooseSwitch = (i: number) => {
    switchState.index = i;
    setSw(i);
    // press the spacebar once so the new switch is seen and heard
    pressKey(CODE_INDEX.Space);
  };

  const cycle = useCallback(() => {
    knob.turns += 1;
    setCw((i) => (i + 1) % COLORWAYS.length);
  }, []);

  const pick = (i: number) => {
    if (i === cw) return;
    knob.turns += 1;
    setCw(i);
  };

  const toggleAccents = () => {
    setAccents((v) => !v);
    // nudge the two keys that change, so it is clear where to look
    pressKey(CODE_INDEX.Escape, { sound: false });
    setTimeout(() => pressKey(CODE_INDEX.Enter, { sound: false }), 90);
  };

  const toggleSound = () => {
    setSound((v) => !v);
    setHint(false);
  };

  // One keystroke, from either the physical keyboard or a tapped 3D key.
  const countKey = useCallback((i: number) => {
    // words per minute over the last ten seconds of typing (5 characters = 1 word)
    const t = performance.now();
    stamps.current = [...stamps.current.filter((s) => t - s < 10000), t];
    const span = Math.max(2000, t - stamps.current[0]);
    const wpm =
      stamps.current.length < 3
        ? 0
        : Math.round(stamps.current.length / 5 / (span / 60000));
    setStats((s) => ({
      keys: s.keys + 1,
      wpm,
      last: KEYS[i].label || "SPACE",
    }));
  }, []);

  // One character, into the free readout and into the speed test if one is running.
  const feed = useCallback((ch: string) => {
    if (ch === BACKSPACE) setTyped((s) => s.slice(0, -1));
    else setTyped((s) => [...s, { id: glyphId.current++, ch }].slice(-22));

    setTest((t) => (t ? typeInto(t, ch) : t));
  }, []);

  const startTest = () => {
    const [next, n] = newTest(lastSentence.current);
    lastSentence.current = n;
    setTest(next);
    // otherwise the first Space would press the focused button again
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  };

  // Phones have no physical keys, so the test listens to a text field instead.
  const onTestInput = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.toLowerCase();
    const prev = test?.typed ?? "";
    if (next.length < prev.length) {
      for (let n = prev.length - next.length; n > 0; n--) {
        feed(BACKSPACE);
        pressKey(CODE_INDEX.Backspace);
      }
      return;
    }
    for (const ch of next.slice(prev.length)) {
      feed(ch);
      const i = keyFor(ch);
      if (i !== undefined) {
        pressKey(i);
        countKey(i);
      }
    }
  };

  useEffect(() => {
    // while a test runs, Space types a space instead of scrolling the page
    testing.current = !!test && !test.result;
    if (test && !test.result && touch) testInput.current?.focus();
  }, [test, touch]);

  // The test ends with the under-key lights flaring and a wave across the board.
  const result = test?.result;
  useEffect(() => {
    if (!result) return;
    gsap
      .timeline()
      .to(glow, { boost: 1.6, duration: 0.3, ease: "power2.out" })
      .to(glow, { boost: 0, duration: 1.8, ease: "power2.inOut" });
    if (!prefersReducedMotion()) {
      wave(0);
      wave(0.5);
    }
  }, [result]);

  // Device checks, and the visitor's saved sound preference.
  useEffect(() => {
    setGl(hasWebGL());
    preloadSounds();
    setTouch(isTouchScreen());
    const saved = storage.get("ventis:sound");
    if (saved) setSound(saved === "on");
  }, []);

  useEffect(() => {
    setSoundEnabled(sound);
    storage.set("ventis:sound", sound ? "on" : "off");
  }, [sound]);

  // Without WebGL there is nothing to wait for.
  useEffect(() => {
    if (gl === false) setReady(true);
  }, [gl]);

  // The legend texture is drawn with Archivo, so the scene waits for the font (but never for long).
  useEffect(() => {
    let alive = true;
    const go = () => alive && setFonts(true);
    const fallback = setTimeout(go, 2500);
    document.fonts
      .load('600 66px "Archivo Variable"')
      .then(() => document.fonts.ready)
      .then(go, go);
    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, []);

  // Never leave the visitor on the loader: if the scene is still not drawing after 12 s, open the page anyway.
  useEffect(() => {
    if (!fonts) return;
    const t = setTimeout(() => setReady(true), 12000);
    return () => clearTimeout(t);
  }, [fonts]);

  // Start the page intro as the loader curtain lifts.
  useEffect(() => {
    if (revealed) introTl.current?.play();
  }, [revealed]);

  // First visit only: point out that the keys make sound, and where to turn it off.
  useEffect(() => {
    if (!revealed || storage.get("ventis:sound-hint")) return;
    storage.set("ventis:sound-hint", "1");
    const show = setTimeout(() => setHint(true), 1800);
    const hide = setTimeout(() => setHint(false), 9000);
    const off = () => window.scrollY > 300 && setHint(false);
    window.addEventListener("scroll", off, { passive: true });
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      window.removeEventListener("scroll", off);
    };
  }, [revealed]);

  // A new finish sends a light sweep across the keys.
  useEffect(() => {
    if (firstFinish.current) {
      firstFinish.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    wave(0.1);
  }, [cw]);

  // The visitor's own keyboard drives the 3D one.
  useEffect(() => {
    const interactive = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      ["BUTTON", "A", "INPUT", "TEXTAREA"].includes(t.tagName);
    const field = (t: EventTarget | null) =>
      t instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(t.tagName);

    const down = (e: KeyboardEvent) => {
      // the phone test field handles its own characters
      if (field(e.target)) return;
      const i = CODE_INDEX[e.code];
      if (i === undefined) return;
      if (!e.repeat) {
        pressKey(i, { hold: true });
        countKey(i);
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        (typing.current || testing.current) &&
        !interactive(e.target) &&
        ["Space", "Quote", "Slash"].includes(e.code)
      ) {
        e.preventDefault();
      }
      if (e.key.length === 1) feed(e.key);
      else if (e.key === "Backspace") feed(BACKSPACE);
    };
    const up = (e: KeyboardEvent) => {
      const i = CODE_INDEX[e.code];
      if (i !== undefined) releaseKey(i);
    };
    // a tap on a 3D key counts as typing too (that is the only way to type on a phone without the test field)
    const tap = (e: Event) => {
      const i = (e as CustomEvent<number>).detail;
      countKey(i);
      const ch = charFor(i);
      if (ch) feed(ch);
    };
    const blur = () => KEYS.forEach((k) => releaseKey(k.id));
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("ventis:tap", tap);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("ventis:tap", tap);
      window.removeEventListener("blur", blur);
    };
  }, [countKey, feed]);

  // Drag sideways on the board to turn it, while the Finishes section is on screen.
  useEffect(() => {
    let drag: { id: number; x: number; base: number } | null = null;
    const html = document.documentElement;
    const down = (e: PointerEvent) => {
      if (!spin.enabled || !(e.target instanceof HTMLCanvasElement)) return;
      drag = { id: e.pointerId, x: e.clientX, base: spin.target };
      html.classList.add("is-grabbing");
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id)
        spin.target = drag.base + (e.clientX - drag.x) * 0.009;
    };
    const up = () => {
      drag = null;
      html.classList.remove("is-grabbing");
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  useGSAP(
    () => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-scene]");
      const reduced = prefersReducedMotion();

      // Scroll position scrubs the board from one pose to the next.
      sections.forEach((el, i) => {
        if (i > 0) {
          gsap.fromTo(
            rig,
            { ...POSES[i - 1] },
            {
              ...POSES[i],
              ease: "power2.inOut",
              immediateRender: false,
              scrollTrigger: {
                trigger: el,
                start: "top bottom",
                end: "top 10%",
                scrub: 0.7,
              },
            },
          );
        }
        // header counter follows the section in view
        ScrollTrigger.create({
          trigger: el,
          start: "top 55%",
          end: "bottom 55%",
          onToggle: (self) => {
            if (self.isActive && count.current)
              count.current.textContent = `${pad(i + 1)} / ${pad(sections.length)}`;
          },
        });
      });

      ScrollTrigger.create({
        trigger: "#type",
        start: "top 60%",
        end: "bottom 40%",
        onToggle: (self) => {
          typing.current = self.isActive;
        },
      });

      // Drag-to-turn is live only in Finishes. On the way out the board turns back to face the camera,
      // taking the short way round.
      ScrollTrigger.create({
        trigger: "#finishes",
        start: "top 55%",
        end: "bottom 45%",
        onToggle: (self) => {
          spin.enabled = self.isActive;
          document.documentElement.classList.toggle("can-spin", self.isActive);
          if (!self.isActive) {
            const TAU = Math.PI * 2;
            spin.value =
              ((((spin.value + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
            spin.target = 0;
          }
        },
      });

      // Thin progress line along the top edge.
      gsap.to(".progress", {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
      });

      // The header slides away while scrolling down and comes back on the way up.
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          const hide = self.direction === 1 && self.scroll() > 140;
          bar.current?.classList.toggle("is-hidden", hide);
        },
      });

      if (reduced) {
        keyState.forEach((s) => (s.drop = 0));
        return;
      }

      // The giant wordmark drifts up and fades as the hero leaves.
      gsap.to(".title", {
        yPercent: -22,
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          trigger: "#top",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
      gsap.to(".hero-copy, .hero-meta", {
        y: -40,
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          trigger: "#top",
          start: "top top",
          end: "45% top",
          scrub: true,
        },
      });

      // Copy in each section rises in once the section is mostly on screen.
      sections.slice(1).forEach((el) => {
        gsap.from(el.querySelectorAll(".rv"), {
          y: 32,
          autoAlpha: 0,
          duration: 0.85,
          ease: "power3.out",
          stagger: 0.06,
          scrollTrigger: {
            trigger: el,
            start: "top 68%",
            toggleActions: "play none none reverse",
          },
        });
      });

      // Load sequence: the board swings in, caps drop into place, one wave runs across them.
      const tl = gsap.timeline({ paused: true });
      introTl.current = tl;
      tl.fromTo(
        intro,
        { rx: 0.5, ry: -1.5, scale: 0.82 },
        { rx: 0, ry: 0, scale: 1, duration: 2.2, ease: "expo.out" },
        0,
      )
        .to(
          keyState,
          {
            drop: 0,
            duration: 0.9,
            ease: "power3.out",
            stagger: (i: number) =>
              0.25 + Math.hypot(KEYS[i].x, KEYS[i].z * 1.5) * 0.06,
          },
          0,
        )
        .from(
          ".title .ch",
          { yPercent: 105, duration: 1.1, ease: "expo.out", stagger: 0.035 },
          0.15,
        )
        .from(
          ".bar > *",
          {
            y: -16,
            autoAlpha: 0,
            duration: 0.7,
            ease: "power3.out",
            stagger: 0.06,
          },
          0.6,
        )
        .from(
          ".hero-copy > *",
          {
            y: 18,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power3.out",
            stagger: 0.1,
          },
          0.9,
        )
        .from(
          ".hero-meta p, .hero-meta li",
          {
            x: 24,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power3.out",
            stagger: 0.08,
          },
          1.1,
        )
        .add(() => wave(0), 1.7);
    },
    { scope: root },
  );

  const vars = {
    "--backdrop": colorway.backdrop,
    "--accent": colorway.accent,
  } as CSSProperties;
  const sceneLabel = `The Ventis-75 keyboard in the ${colorway.name} finish with ${switchType.name} switches${
    accents ? "" : " and no accent keys"
  }. It turns, opens up and flips over as you scroll.`;

  return (
    <div ref={root} className="app" style={vars}>
      <div className="backdrop" aria-hidden />

      <div className="title" aria-hidden>
        {TITLE.split("").map((c, i) => (
          <span className="mask" key={i}>
            <span className="ch">{c}</span>
          </span>
        ))}
      </div>

      {fonts && gl && (
        <GLBoundary onError={onGLFail}>
          <Scene
            colorway={colorway}
            switchColor={switchType.color}
            accents={accents}
            label={sceneLabel}
            onKnob={cycle}
            onReady={onReady}
          />
        </GLBoundary>
      )}
      {gl === false && <Fallback colorway={colorway} accents={accents} />}

      <Loader ready={ready} onReveal={onReveal} />

      <span className="progress" aria-hidden />

      <header className="bar" ref={bar} inert={!revealed}>
        <a className="mark" href="#top">
          Ventis
        </a>
        <nav aria-label="Sections">
          <a href="#switches">Switches</a>
          <a href="#layers">Layers</a>
          <a href="#finishes">Finishes</a>
          <a href="#specs">Specs</a>
        </nav>
        <span className="count" ref={count} aria-hidden>
          01 / {pad(SECTIONS.length)}
        </span>
        <div className="sound-wrap">
          <button
            type="button"
            className="sound"
            aria-pressed={sound}
            onClick={toggleSound}
          >
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Key sound {sound ? "on" : "off"}
          </button>
          <p className={hint ? "sound-hint is-on" : "sound-hint"} role="status">
            {hint &&
              (sound
                ? "Every key makes a sound. You can mute it here."
                : "Turn on sound for the full feel.")}
          </p>
        </div>
      </header>

      <main inert={!revealed}>
        <section id="top" className="scene hero" data-scene>
          <h1 className="sr">Ventis-75</h1>
          <div className="hero-copy">
            <p className="lede">
              A 75% aluminium keyboard you can take apart on this page.{" "}
              {touch
                ? "Tap a key and it presses."
                : "Start typing and it types along with you."}
            </p>
            <p className="hint">
              <span className="hint-line" aria-hidden />
              Scroll to open it up
            </p>
          </div>
          <div className="hero-meta">
            <p>Highlights</p>
            <ul>
              {HIGHLIGHTS.map((h, i) => (
                <li key={h}>
                  <span>{pad(i + 1)}</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="type" className="scene type" data-scene>
          <div className="copy wide">
            <p className="eyebrow rv">02 — Try it</p>
            <h2 className="rv">{touch ? "Tap the keys" : "Type something"}</h2>
            <p className="rv">
              {touch
                ? "Every key on the board presses when you tap it. Or take the speed test below with your phone keyboard."
                : "Each key here follows its twin on your desk. Clicking a key works too."}
            </p>

            {test ? (
              <div className="test">
                <p className="target" aria-label={`Type: ${test.text}`}>
                  {[...test.text].map((ch, i) => (
                    <span key={i} className={charState(test, i)} aria-hidden>
                      {ch}
                    </span>
                  ))}
                </p>
                {touch && !test.result && (
                  <input
                    ref={testInput}
                    className="test-input"
                    value={test.typed}
                    onChange={onTestInput}
                    aria-label="Type the sentence here"
                    placeholder="Tap here to type"
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="done"
                  />
                )}
                <p className="result" aria-live="polite">
                  {test.result ? (
                    <>
                      <strong>{test.result.wpm} wpm</strong>
                      <span>{test.result.acc}% accuracy</span>
                      <span>{test.result.secs} s</span>
                    </>
                  ) : (
                    <span>
                      {test.keys
                        ? `${test.typed.length} / ${test.text.length}`
                        : "The clock starts on your first key."}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p className="readout rv" aria-live="off">
                {typed.length ? (
                  typed.map((g) => (
                    <span className="glyph" key={g.id}>
                      {g.ch}
                    </span>
                  ))
                ) : (
                  <span>
                    {touch
                      ? "Tap a key on the board"
                      : "Your keys press these keys"}
                  </span>
                )}
                <i className="caret" aria-hidden />
              </p>
            )}

            <div className="type-foot rv">
              <dl className="stats">
                <div>
                  <dt>Keystrokes</dt>
                  <dd>{stats.keys}</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>{stats.wpm ? `${stats.wpm} wpm` : "—"}</dd>
                </div>
                <div>
                  <dt>Last key</dt>
                  <dd>
                    {stats.last ? (
                      <kbd key={stats.keys}>{stats.last}</kbd>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              <div className="test-actions">
                {test && !test.result && (
                  <button
                    type="button"
                    className="pill ghost"
                    onClick={() => setTest(null)}
                  >
                    Stop
                  </button>
                )}
                <button type="button" className="pill" onClick={startTest}>
                  {test
                    ? test.result
                      ? "Try another"
                      : "New sentence"
                    : "Take the speed test"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="switches" className="scene right" data-scene>
          <div className="copy">
            <p className="eyebrow rv">03 — Switches</p>
            <h2 className="rv">Pick how it feels</h2>
            <p className="rv">
              Every switch sits in a hot-swap socket, so you can change your
              mind later. Choose one and the stems, the sound and the force
              curve all follow.
            </p>
            <div className="rv">
              <SwitchPicker value={sw} onChange={chooseSwitch} />
            </div>
            <p className="rv">
              <span className="swap" key={switchType.id}>
                <strong>
                  {switchType.name} {switchType.kind.toLowerCase()}.
                </strong>{" "}
                {switchType.feel}
              </span>
            </p>
            <div className="rv">
              <ForceCurve sw={switchType} large />
            </div>
          </div>
        </section>

        <section id="layers" className="scene left" data-scene>
          <div className="copy">
            <p className="eyebrow rv">04 — Anatomy</p>
            <h2 className="rv">Seven parts, top to bottom</h2>
            <ul className="stack" onPointerLeave={() => (focus.layer = -1)}>
              {LAYERS.map(([name, detail], i) => (
                <li
                  key={name}
                  className="rv"
                  tabIndex={0}
                  onPointerEnter={() => (focus.layer = i)}
                  onFocus={() => (focus.layer = i)}
                  onBlur={() => (focus.layer = -1)}
                >
                  <strong>{name}</strong>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
            <p className="quiet rv">
              Point at a part, or tab to it, to lift it out of the stack.
            </p>
          </div>
        </section>

        <section id="finishes" className="scene right" data-scene>
          <div className="copy">
            <p className="eyebrow rv">05 — Finishes</p>
            <h2 className="rv">Four finishes</h2>
            <div className="swatches rv" role="group" aria-label="Finish">
              {COLORWAYS.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={i === cw}
                  onClick={() => pick(i)}
                >
                  <span className="chips" aria-hidden>
                    <i style={{ background: c.case }} />
                    <i style={{ background: c.mod }} />
                    <i style={{ background: c.accent }} />
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
            <p className="rv">
              <span className="swap" key={colorway.id}>
                {colorway.note}
              </span>
            </p>
            <div className="rv">
              <button
                type="button"
                className="toggle"
                aria-pressed={accents}
                onClick={toggleAccents}
              >
                <span className="track" aria-hidden>
                  <span />
                </span>
                Accent Esc and Enter
              </button>
            </div>
            {gl !== false && (
              <p className="quiet rv">
                Drag the board sideways to turn it. Pressing the knob switches
                finish as well.
              </p>
            )}
          </div>
        </section>

        <section id="underside" className="scene left" data-scene>
          <div className="copy">
            <p className="eyebrow rv">06 — Underside</p>
            <h2 className="rv">The side that faces the desk</h2>
            <p className="rv">
              A 480 g brass plate sits in the base. It stops the case ringing
              when you bottom out, and it keeps the board from sliding during
              fast typing. Each one is polished and numbered by hand.
            </p>
            <ul className="facts">
              {UNDERSIDE.map(([n, label]) => (
                <li key={label} className="rv">
                  <strong>{n}</strong>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="desk" className="scene left" data-scene>
          <div className="copy">
            <p className="eyebrow rv">07 — At the desk</p>
            <h2 className="rv">Heavy enough to stay put</h2>
            <p className="rv">
              At 1.9 kg it does not wander when you type fast. The 7° angle is
              milled into the case, so it sits flat on the mat with no flip-out
              feet to wobble, and the low front edge keeps your wrists down.
            </p>
          </div>
        </section>

        <section id="specs" className="scene left last" data-scene>
          <div className="copy">
            <p className="eyebrow rv">08 — The numbers</p>
            <h2 className="rv">Specifications</h2>
            <dl className="specs">
              {SPECS.map(([k, v]) => (
                <div key={k} className="rv">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {/* the reveal runs on the wrapper; the link keeps its own hover transform */}
            <div className="cta rv">
              <a className="button" href="#top">
                Back to the top
              </a>
            </div>
            <p className="fine rv">
              Ventis-75 is a concept. Everything above is drawn live in your
              browser: no 3D model files, no images.
            </p>
          </div>
        </section>
      </main>

      <footer className="foot" inert={!revealed}>
        <span>
          © {SITE.year} {SITE.author}
        </span>
        {SITE.links
          .filter((l) => l.href)
          .map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ))}
      </footer>
    </div>
  );
}
