import { SENTENCES } from './content';

export interface SpeedTest {
  text: string;
  typed: string;
  /** performance.now() at the first key, 0 until then */
  start: number;
  keys: number;
  errors: number;
  result: null | { wpm: number; acc: number; secs: number };
}

export const BACKSPACE = '\b';

/** A fresh test on a random sentence, never the one at index `last`. Returns the index used. */
export function newTest(last: number): [SpeedTest, number] {
  let n = Math.floor(Math.random() * SENTENCES.length);
  if (n === last) n = (n + 1) % SENTENCES.length;
  return [{ text: SENTENCES[n], typed: '', start: 0, keys: 0, errors: 0, result: null }, n];
}

/**
 * The test after one more character (or BACKSPACE). The clock starts on the first key. Speed counts only
 * correct characters (5 to a word); accuracy counts every key, so a fixed mistake still costs.
 */
export function typeInto(t: SpeedTest, ch: string, now = performance.now()): SpeedTest {
  if (t.result) return t;
  if (ch === BACKSPACE) return { ...t, typed: t.typed.slice(0, -1) };
  if (t.typed.length >= t.text.length) return t;
  const start = t.keys === 0 ? now : t.start;
  const typed = t.typed + ch;
  const keys = t.keys + 1;
  const errors = t.errors + (ch === t.text[t.typed.length] ? 0 : 1);
  if (typed.length < t.text.length) return { ...t, typed, start, keys, errors };
  const ms = Math.max(now - start, 500);
  const correct = [...typed].filter((c, i) => c === t.text[i]).length;
  return {
    ...t,
    typed,
    start,
    keys,
    errors,
    result: {
      wpm: Math.round(correct / 5 / (ms / 60000)),
      acc: Math.round(((keys - errors) / keys) * 100),
      secs: Math.round(ms / 100) / 10,
    },
  };
}

/** Each character's state for highlighting: typed right, typed wrong, the next one, or still to come. */
export const charState = (t: SpeedTest, i: number) =>
  i < t.typed.length ? (t.typed[i] === t.text[i] ? 'ok' : 'bad') : i === t.typed.length && !t.result ? 'cur' : '';
