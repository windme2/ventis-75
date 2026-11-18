// Page copy and the lists the page is built from. Kept apart from the components so wording can
// change without touching the scene or the scroll code.

// Order matters: Keyboard.tsx lifts the layer at the same index when its row is hovered.
export const LAYERS = [
  ["Keycaps", "Double-shot PBT, Cherry profile, 1.5 mm walls"],
  [
    "Switches",
    "Red, brown, blue or black, lubed at the factory, hot-swappable",
  ],
  ["Plate", "Brass or aluminium, held by ten silicone gaskets"],
  ["Circuit board", "1.2 mm with flex cuts and an LED under every key"],
  ["Top case", "Milled from one block of 6063 aluminium"],
  ["Bottom case", "Same block, 7° typing angle built in"],
  ["Weight", "480 g of mirror-polished brass, numbered"],
];

export const SPECS = [
  ["Layout", "75%, 82 keys and a rotary knob"],
  ["Size", "325 × 138 × 33 mm"],
  ["Mass", "1.9 kg assembled"],
  ["Mount", "Gasket, ten silicone pads"],
  ["Connection", "USB-C, Bluetooth 5.1, 2.4 GHz"],
  ["Polling", "1000 Hz wired and 2.4 GHz"],
  ["Battery", "4000 mAh, about 200 hours with lights off"],
  [
    "Switches",
    "Ventis Red (linear), Brown (tactile), Blue (clicky), Black (heavy linear)",
  ],
  ["Keycaps", "Double-shot PBT, Cherry profile, shifted sub-legends"],
  ["Firmware", "QMK and VIA"],
  ["Price", "$199"],
];

export const HIGHLIGHTS = [
  "Gasket-mounted",
  "Hot-swap sockets",
  "Wired + two wireless modes",
];

export const UNDERSIDE = [
  ["480 g", "brass weight"],
  ["4", "silicone feet"],
  ["7°", "typing angle"],
];

// Short, lower-case lines for the speed test. Pangrams keep every letter in play.
export const SENTENCES = [
  "the quick brown fox jumps over the lazy dog",
  "sphinx of black quartz, judge my vow",
  "a heavy brass weight keeps the board from sliding",
  "every switch sits in a hot swap socket",
  "pack my box with five dozen jugs of milk",
  "gasket mounts make each key land a little softer",
  "type until the caps feel like your own",
];

export const TITLE = "Ventis-75";
export const SECTIONS = [
  "top",
  "type",
  "switches",
  "layers",
  "finishes",
  "underside",
  "desk",
  "specs",
];
