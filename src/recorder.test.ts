import { describe, expect, it } from "vitest";
import { finalizeNotes, Recorder } from "./recorder";

describe("finalizeNotes", () => {
  it("10ms単位に丸め、最小長を保証し、時刻順に並べる", () => {
    const notes = finalizeNotes([
      { pitch: 64, start: 504, end: 700 },
      { pitch: 60, start: 3, end: 10 },
    ]);
    expect(notes).toEqual([
      { pitch: 60, start: 0, dur: 40 },
      { pitch: 64, start: 500, dur: 200 },
    ]);
  });
});

describe("Recorder", () => {
  it("最初の音の onset が t=0 になる(手前の無音は記録しない)", () => {
    const r = new Recorder();
    r.start();
    r.noteOn(1, 60, 5000);
    r.noteOff(1, 5200);
    r.noteOn(1, 67, 5500);
    r.noteOff(1, 5800);
    expect(r.stop(6000)).toEqual([
      { pitch: 60, start: 0, dur: 200 },
      { pitch: 67, start: 500, dur: 300 },
    ]);
  });

  it("録音中でなければ無視する", () => {
    const r = new Recorder();
    r.noteOn(1, 60, 0);
    expect(r.count).toBe(0);
  });

  it("押しっぱなしの音は停止時刻で閉じる", () => {
    const r = new Recorder();
    r.start();
    r.noteOn(1, 60, 100);
    expect(r.stop(600)).toEqual([{ pitch: 60, start: 0, dur: 500 }]);
  });

  it("和音(同時押し)を別々の音として記録する", () => {
    const r = new Recorder();
    r.start();
    r.noteOn(1, 60, 0);
    r.noteOn(2, 64, 10);
    r.noteOff(1, 300);
    r.noteOff(2, 310);
    const notes = r.stop(400);
    expect(notes.map((n) => n.pitch)).toEqual([60, 64]);
  });

  it("1音戻すで直前の音を消す", () => {
    const r = new Recorder();
    r.start();
    r.noteOn(1, 60, 0);
    r.noteOff(1, 100);
    r.noteOn(1, 99, 200); // ミスタップ
    r.noteOff(1, 300);
    r.undoLast();
    expect(r.count).toBe(1);
    expect(r.stop(400)).toEqual([{ pitch: 60, start: 0, dur: 100 }]);
  });

  it("全部消したら次の音が t=0 になる", () => {
    const r = new Recorder();
    r.start();
    r.noteOn(1, 99, 1000);
    r.noteOff(1, 1100);
    r.undoLast();
    r.noteOn(1, 60, 9000);
    r.noteOff(1, 9100);
    expect(r.stop(9200)).toEqual([{ pitch: 60, start: 0, dur: 100 }]);
  });

  it("取り消した音の noteOff が後から来ても壊れない", () => {
    const r = new Recorder();
    r.start();
    r.noteOn(1, 60, 0);
    r.undoLast();
    r.noteOff(1, 100);
    expect(r.stop(200)).toEqual([]);
  });

  it("音がなければ空配列", () => {
    const r = new Recorder();
    r.start();
    expect(r.stop(1000)).toEqual([]);
  });
});
