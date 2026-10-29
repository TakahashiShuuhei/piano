import { ALL_WHITE_KEYS, shiftLowest } from "./music";
import type { Waveform } from "./synth";

export interface Settings {
  apiKey: string;
  waveform: Waveform;
  glissando: boolean;
  keyWidth: number; // 白鍵の目標幅(px)
  lowest: number; // 下段(横持ちでは唯一の段)の最低音(白鍵のMIDI番号)
  lowestUpper: number; // 縦持ちのときの上段の最低音(白鍵のMIDI番号)
}

export const KEY_WIDTH_MIN = 28;
export const KEY_WIDTH_MAX = 110;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  waveform: "sawtooth",
  glissando: false,
  keyWidth: 48,
  lowest: 48, // C3
  lowestUpper: 60, // C4
};

const STORAGE_KEY = "piano-settings-v1";
const WAVEFORMS: Waveform[] = ["sawtooth", "square", "triangle"];

export function sanitize(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const keyWidth = typeof r.keyWidth === "number" && Number.isFinite(r.keyWidth) ? r.keyWidth : d.keyWidth;
  const lowest = ALL_WHITE_KEYS.includes(r.lowest as number) ? (r.lowest as number) : d.lowest;
  return {
    apiKey: typeof r.apiKey === "string" ? r.apiKey.trim() : d.apiKey,
    waveform: WAVEFORMS.includes(r.waveform as Waveform) ? (r.waveform as Waveform) : d.waveform,
    glissando: typeof r.glissando === "boolean" ? r.glissando : d.glissando,
    keyWidth: Math.min(KEY_WIDTH_MAX, Math.max(KEY_WIDTH_MIN, Math.round(keyWidth))),
    lowest,
    // 未設定なら下段の1オクターブ上から始める(保存済みの下段が高くても上段が重ならない)
    lowestUpper: ALL_WHITE_KEYS.includes(r.lowestUpper as number)
      ? (r.lowestUpper as number)
      : shiftLowest(lowest, 7),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // プライベートモード等で保存できなくても動作は続ける
  }
}
