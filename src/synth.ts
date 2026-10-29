import { midiToFreq } from "./music";

export type Waveform = "sawtooth" | "square" | "triangle";

const ATTACK_S = 0.003;
const DECAY_TC = 0.15; // 減衰の時定数
const SUSTAIN = 0.55;
const RELEASE_TC = 0.025; // リリースの時定数(約3倍で十分小さくなる)
const MASTER_GAIN = 0.3;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  startTime: number;
}

export class Synth {
  waveform: Waveform = "sawtooth";

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private live = new Map<number, Voice>();
  private scheduled = new Set<Voice>();

  // ユーザー操作の中で呼ぶこと(AudioContext の生成・再開に必要)。
  unlock(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // 鍵盤操作用。id(pointerId)ごとに1音。
  noteOn(id: number, midi: number): void {
    const ctx = this.unlock();
    this.noteOff(id);
    this.live.set(id, this.start(ctx.currentTime, midi));
  }

  noteOff(id: number): void {
    const v = this.live.get(id);
    if (!v) return;
    this.live.delete(id);
    this.release(v, this.currentTime);
  }

  allOff(): void {
    for (const id of [...this.live.keys()]) this.noteOff(id);
  }

  // 録音の再生用。startAt はこの呼び出しからの相対秒。
  playNote(midi: number, startAt: number, dur: number): void {
    const ctx = this.unlock();
    const t = ctx.currentTime + startAt;
    const v = this.start(t, midi);
    this.scheduled.add(v);
    this.release(v, t + dur);
    v.osc.addEventListener("ended", () => this.scheduled.delete(v));
  }

  stopPlayback(): void {
    const t = this.currentTime;
    for (const v of this.scheduled) {
      // まだ鳴り始めていない音は、鳴らさずに破棄する。
      if (v.startTime > t) v.osc.stop(t);
      else this.release(v, t);
    }
    this.scheduled.clear();
  }

  private start(t: number, midi: number): Voice {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = this.waveform;
    osc.frequency.value = midiToFreq(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + ATTACK_S);
    gain.gain.setTargetAtTime(SUSTAIN, t + ATTACK_S, DECAY_TC);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    return { osc, gain, startTime: t };
  }

  private release(v: Voice, t: number): void {
    const g = v.gain.gain;
    // 現在値から滑らかに落とす(クリックノイズ防止)。
    if (typeof g.cancelAndHoldAtTime === "function") g.cancelAndHoldAtTime(t);
    else g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, RELEASE_TC);
    v.osc.stop(t + RELEASE_TC * 8);
  }
}
