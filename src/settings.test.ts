import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, KEY_WIDTH_MAX, KEY_WIDTH_MIN, sanitize } from "./settings";

describe("sanitize", () => {
  it("空なら初期値(上段は下段の1オクターブ上)", () => {
    expect(sanitize(null)).toEqual({ ...DEFAULT_SETTINGS, lowestUpper: 60 });
    expect(sanitize(null).lowest).toBe(48);
  });

  it("上段が未保存の旧データは、下段の1オクターブ上にする", () => {
    const s = sanitize({ lowest: 60, keyWidth: 90 });
    expect(s.lowest).toBe(60);
    expect(s.lowestUpper).toBe(72);
    expect(s.keyWidth).toBe(90);
  });

  it("不正な値は初期値に戻し、幅は範囲に収める", () => {
    const s = sanitize({ lowest: 61, lowestUpper: "x", waveform: "sine", keyWidth: 9999 });
    expect(s.lowest).toBe(48); // 黒鍵(61)は不可
    expect(s.waveform).toBe("sawtooth");
    expect(s.keyWidth).toBe(KEY_WIDTH_MAX);
    expect(sanitize({ keyWidth: 1 }).keyWidth).toBe(KEY_WIDTH_MIN);
  });
});
