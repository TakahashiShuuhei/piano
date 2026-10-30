export interface Note {
  pitch: number; // MIDI番号
  start: number; // ms(最初の音の onset が 0)
  dur: number; // ms
}

// 時間は10ms単位に丸める。ビート量子化・テンポ推定は検索側で後から行う。
export const TIME_STEP_MS = 10;
export const MIN_DUR_MS = 40;

interface RawNote {
  pitch: number;
  start: number;
  end: number | null;
}

export function finalizeNotes(raw: { pitch: number; start: number; end: number }[]): Note[] {
  return raw
    .map((n) => {
      const start = Math.round(n.start / TIME_STEP_MS) * TIME_STEP_MS;
      const dur = Math.max(MIN_DUR_MS, Math.round((n.end - n.start) / TIME_STEP_MS) * TIME_STEP_MS);
      return { pitch: n.pitch, start, dur };
    })
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

// 時刻はすべて呼び出し側が渡す(pointer event の timeStamp を想定)。
export class Recorder {
  private notes: RawNote[] = [];
  private openById = new Map<number, RawNote>();
  private t0: number | null = null;
  private active = false;

  get recording(): boolean {
    return this.active;
  }

  get count(): number {
    return this.notes.length;
  }

  start(): void {
    this.notes = [];
    this.openById.clear();
    this.t0 = null;
    this.active = true;
  }

  // 最初の1音の onset を t=0 とする(考えている無音は記録しない)。
  noteOn(id: number, pitch: number, ts: number): void {
    if (!this.active) return;
    if (this.t0 === null) this.t0 = ts;
    this.notes.push({ pitch, start: ts - this.t0, end: null });
    this.openById.set(id, this.notes[this.notes.length - 1]);
  }

  noteOff(id: number, ts: number): void {
    const n = this.openById.get(id);
    if (!n) return;
    this.openById.delete(id);
    if (this.t0 !== null) n.end = ts - this.t0;
  }

  stop(ts: number): Note[] {
    this.active = false;
    const end = this.t0 === null ? 0 : ts - this.t0;
    const raw = this.notes.map((n) => ({
      pitch: n.pitch,
      start: n.start,
      end: n.end ?? end,
    }));
    this.notes = [];
    this.openById.clear();
    this.t0 = null;
    return finalizeNotes(raw);
  }
}
