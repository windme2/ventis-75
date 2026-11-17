export type KeyKind = 'alpha' | 'mod' | 'accent';

export interface KeyDef {
  id: number;
  code: string; // KeyboardEvent.code
  label: string;
  sub?: string; // shifted legend printed above the main one
  w: number; // width in units (1u = 19.05 mm)
  x: number; // centre, board-local
  z: number;
  row: number;
  kind: KeyKind;
}

type Raw = [code: string, label: string, w?: number, kind?: KeyKind];

const letters = (s: string): Raw[] => s.split('').map((c) => [`Key${c}`, c]);
// F-keys in blocks of four, the middle block in the alpha colour
const fkeys: Raw[] = Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`, 1, i >= 4 && i < 8 ? 'alpha' : 'mod']);

const SHIFTED: Record<string, string> = {
  Backquote: '~',
  Digit1: '!',
  Digit2: '@',
  Digit3: '#',
  Digit4: '$',
  Digit5: '%',
  Digit6: '^',
  Digit7: '&',
  Digit8: '*',
  Digit9: '(',
  Digit0: ')',
  Minus: '_',
  Equal: '+',
  BracketLeft: '{',
  BracketRight: '}',
  Backslash: '|',
  Semicolon: ':',
  Quote: '"',
  Comma: '<',
  Period: '>',
  Slash: '?',
};

// 75% layout, every row is 16u wide (the last 2u of the top row hold the knob).
const ROWS: Raw[][] = [
  [['Escape', 'ESC', 1, 'accent'], ...fkeys, ['Delete', 'DEL', 1, 'mod']],
  [
    ['Backquote', '`'],
    ...'1234567890'.split('').map((d): Raw => [`Digit${d}`, d]),
    ['Minus', '-'],
    ['Equal', '='],
    ['Backspace', 'BKSP', 2, 'mod'],
    ['Home', 'HOME', 1, 'mod'],
  ],
  [
    ['Tab', 'TAB', 1.5, 'mod'],
    ...letters('QWERTYUIOP'),
    ['BracketLeft', '['],
    ['BracketRight', ']'],
    ['Backslash', '\\', 1.5, 'mod'],
    ['PageUp', 'PGUP', 1, 'mod'],
  ],
  [
    ['CapsLock', 'CAPS', 1.75, 'mod'],
    ...letters('ASDFGHJKL'),
    ['Semicolon', ';'],
    ['Quote', "'"],
    ['Enter', 'ENTER', 2.25, 'accent'],
    ['PageDown', 'PGDN', 1, 'mod'],
  ],
  [
    ['ShiftLeft', 'SHIFT', 2.25, 'mod'],
    ...letters('ZXCVBNM'),
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
    ['ShiftRight', 'SHIFT', 1.75, 'mod'],
    ['ArrowUp', '↑', 1, 'mod'],
    ['End', 'END', 1, 'mod'],
  ],
  [
    ['ControlLeft', 'CTRL', 1.25, 'mod'],
    ['MetaLeft', 'CMD', 1.25, 'mod'],
    ['AltLeft', 'ALT', 1.25, 'mod'],
    ['Space', '', 6.25, 'alpha'],
    ['AltRight', 'ALT', 1, 'mod'],
    ['Fn', 'FN', 1, 'mod'],
    ['ControlRight', 'CTRL', 1, 'mod'],
    ['ArrowLeft', '←', 1, 'mod'],
    ['ArrowDown', '↓', 1, 'mod'],
    ['ArrowRight', '→', 1, 'mod'],
  ],
];

const ROW_Z = [0, 1.25, 2.25, 3.25, 4.25, 5.25];
export const BOARD = { w: 16, d: 6.25 };
const CENTER_Z = (ROW_Z[5] + 0.5 - 0.5) / 2;

export const KEYS: KeyDef[] = [];
ROWS.forEach((row, r) => {
  let cursor = 0;
  row.forEach(([code, label, w = 1, kind = 'alpha']) => {
    KEYS.push({
      id: KEYS.length,
      code,
      label,
      sub: SHIFTED[code],
      w,
      x: cursor + w / 2 - BOARD.w / 2,
      z: ROW_Z[r] - CENTER_Z,
      row: r,
      kind,
    });
    cursor += w;
  });
});

export const KNOB = { x: 15 - BOARD.w / 2, z: ROW_Z[0] - CENTER_Z };

export const CODE_INDEX: Record<string, number> = Object.fromEntries(
  KEYS.map((k) => [k.code, k.id]),
);
