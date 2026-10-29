// 鍵盤で扱える範囲は標準88鍵(A0〜C8)。
export const MIDI_MIN = 21;
export const MIDI_MAX = 108;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export function isBlack(midi: number): boolean {
  return BLACK_PCS.has(midi % 12);
}

// C4 = 60
export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const ALL_WHITE_KEYS: readonly number[] = Array.from(
  { length: MIDI_MAX - MIDI_MIN + 1 },
  (_, i) => MIDI_MIN + i,
).filter((m) => !isBlack(m));

export interface BlackKey {
  midi: number;
  // 左隣の白鍵の index(表示範囲内)。黒鍵は白鍵 index+1 との境界に置く。
  afterWhiteIndex: number;
}

export interface KeyboardLayout {
  whites: number[];
  blacks: BlackKey[];
}

// 白鍵 lowest から whiteCount 個を表示する配置を返す。
// 上限(C8)を超えないよう、表示開始位置を左へ寄せる。
export function buildLayout(lowest: number, whiteCount: number): KeyboardLayout {
  const total = ALL_WHITE_KEYS.length;
  const count = Math.max(1, Math.min(whiteCount, total));
  let start = ALL_WHITE_KEYS.indexOf(lowest);
  if (start < 0) start = nearestWhiteIndex(lowest);
  start = Math.min(start, total - count);
  const whites = ALL_WHITE_KEYS.slice(start, start + count);
  const blacks: BlackKey[] = [];
  for (let i = 0; i < whites.length - 1; i++) {
    if (whites[i + 1] - whites[i] === 2) {
      blacks.push({ midi: whites[i] + 1, afterWhiteIndex: i });
    }
  }
  return { whites, blacks };
}

function nearestWhiteIndex(midi: number): number {
  let best = 0;
  for (let i = 0; i < ALL_WHITE_KEYS.length; i++) {
    if (Math.abs(ALL_WHITE_KEYS[i] - midi) < Math.abs(ALL_WHITE_KEYS[best] - midi)) best = i;
  }
  return best;
}

// 最低音を白鍵 steps 個ぶんずらす(オクターブ移動は ±7)。
export function shiftLowest(lowest: number, steps: number): number {
  const i = ALL_WHITE_KEYS.indexOf(lowest);
  const base = i < 0 ? nearestWhiteIndex(lowest) : i;
  const next = Math.max(0, Math.min(ALL_WHITE_KEYS.length - 1, base + steps));
  return ALL_WHITE_KEYS[next];
}
