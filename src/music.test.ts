import { describe, expect, it } from "vitest";
import { ALL_WHITE_KEYS, buildLayout, isBlack, midiToFreq, noteName, shiftLowest } from "./music";

describe("noteName", () => {
  it("C4 = 60", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(21)).toBe("A0");
    expect(noteName(108)).toBe("C8");
  });
});

describe("midiToFreq", () => {
  it("A4 = 440Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe("buildLayout", () => {
  it("C4 から白鍵8個: 黒鍵は C# D# F# G# A#", () => {
    const l = buildLayout(60, 8);
    expect(l.whites).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(l.blacks.map((b) => b.midi)).toEqual([61, 63, 66, 68, 70]);
    // C# は C(index0) と D(index1) の境界
    expect(l.blacks[0].afterWhiteIndex).toBe(0);
    expect(l.blacks.every((b) => isBlack(b.midi))).toBe(true);
  });

  it("E 始まりでは E-F の間に黒鍵を置かない", () => {
    const l = buildLayout(64, 3); // E F G
    expect(l.blacks.map((b) => b.midi)).toEqual([66]);
  });

  it("上限(C8)を超えないよう左へ寄せる", () => {
    const l = buildLayout(108, 5);
    expect(l.whites).toHaveLength(5);
    expect(l.whites[l.whites.length - 1]).toBe(108);
  });

  it("白鍵が88鍵ぶんより多く要求されても全鍵で止まる", () => {
    const l = buildLayout(60, 999);
    expect(l.whites).toHaveLength(ALL_WHITE_KEYS.length);
    expect(l.whites[0]).toBe(21);
  });

  it("黒鍵のMIDI番号を渡されたら近い白鍵に直す", () => {
    expect(buildLayout(61, 1).whites).toHaveLength(1);
  });
});

describe("shiftLowest", () => {
  it("オクターブ = 白鍵7つ", () => {
    expect(shiftLowest(60, 7)).toBe(72);
    expect(shiftLowest(60, -7)).toBe(48);
  });

  it("範囲の端で止まる", () => {
    expect(shiftLowest(21, -7)).toBe(21);
    expect(shiftLowest(108, 7)).toBe(108);
  });
});
