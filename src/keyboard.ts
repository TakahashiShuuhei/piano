import { buildLayout, noteName } from "./music";

export interface KeyboardOptions {
  lowest: number;
  // 白鍵1つあたりの目標幅(px)。実際は画面幅に収まる個数に切り上げて均等に広げる。
  keyWidth: number;
  glissando: boolean;
}

export interface KeyboardHandlers {
  onNoteOn(id: number, midi: number, ts: number): void;
  onNoteOff(id: number, midi: number, ts: number): void;
  // 描画のたびに、実際に表示されている範囲(白鍵)を通知する。
  onLayout(lowest: number, highest: number): void;
}

export class Keyboard {
  private opts: KeyboardOptions;
  private keyEls = new Map<number, HTMLElement>();
  private held = new Map<number, number>(); // pointerId -> midi
  private lit = new Map<number, number>(); // midi -> 点灯の参照カウント
  private lowestShown = 0;
  private width = 0;

  constructor(
    private root: HTMLElement,
    opts: KeyboardOptions,
    private handlers: KeyboardHandlers,
  ) {
    this.opts = { ...opts };
    root.addEventListener("pointerdown", this.onDown);
    root.addEventListener("pointermove", this.onMove);
    root.addEventListener("pointerup", this.onUp);
    root.addEventListener("pointercancel", this.onUp);
    root.addEventListener("contextmenu", (e) => e.preventDefault());
    // 高さだけの変化(ソフトキーボード表示など)では作り直さない。
    new ResizeObserver(() => {
      if (root.clientWidth !== this.width) this.render();
    }).observe(root);
    this.render();
  }

  // 実際に表示されている最低音(上限で寄せられた場合は設定値と異なる)。
  // 非表示(幅0)で一度も描画されていない間は、設定された値を返す。
  get lowestMidi(): number {
    return this.lowestShown || this.opts.lowest;
  }

  setOptions(patch: Partial<KeyboardOptions>): void {
    this.opts = { ...this.opts, ...patch };
    this.render();
  }

  // 演奏の再生中などに外から点灯させる。
  light(midi: number, on: boolean): void {
    const n = (this.lit.get(midi) ?? 0) + (on ? 1 : -1);
    if (n > 0) this.lit.set(midi, n);
    else this.lit.delete(midi);
    this.keyEls.get(midi)?.classList.toggle("active", n > 0);
  }

  releaseAll(ts: number): void {
    for (const [id, midi] of this.held) this.handlers.onNoteOff(id, midi, ts);
    for (const midi of this.held.values()) this.light(midi, false);
    this.held.clear();
  }

  private render(): void {
    const width = this.root.clientWidth;
    if (width === 0) {
      this.lowestShown = 0; // 非表示の間は設定値をそのまま使う(lowestMidi 参照)
      return;
    }
    const count = Math.max(1, Math.floor(width / this.opts.keyWidth));
    const layout = buildLayout(this.opts.lowest, count);
    this.lowestShown = layout.whites[0];
    this.width = width;

    // 再描画で DOM が作り直されるので、押下中の鍵は一旦離した扱いにする。
    this.releaseAll(performance.now());
    this.root.replaceChildren();
    this.keyEls.clear();

    const n = layout.whites.length;
    for (const midi of layout.whites) {
      const el = document.createElement("div");
      el.className = "key white";
      el.dataset.midi = String(midi);
      if (midi % 12 === 0) {
        const label = document.createElement("span");
        label.textContent = noteName(midi);
        el.appendChild(label);
      }
      this.root.appendChild(el);
      this.keyEls.set(midi, el);
    }
    for (const b of layout.blacks) {
      const el = document.createElement("div");
      el.className = "key black";
      el.dataset.midi = String(b.midi);
      el.style.left = `${((b.afterWhiteIndex + 1) / n) * 100}%`;
      el.style.width = `${(0.62 / n) * 100}%`;
      this.root.appendChild(el);
      this.keyEls.set(b.midi, el);
    }
    for (const [midi, c] of this.lit) {
      if (c > 0) this.keyEls.get(midi)?.classList.add("active");
    }
    this.handlers.onLayout(layout.whites[0], layout.whites[n - 1]);
  }

  private midiAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const key = el instanceof HTMLElement ? el.closest<HTMLElement>(".key") : null;
    if (!key || !this.root.contains(key)) return null;
    return Number(key.dataset.midi);
  }

  private press(id: number, midi: number, ts: number): void {
    this.held.set(id, midi);
    this.light(midi, true);
    this.handlers.onNoteOn(id, midi, ts);
  }

  private release(id: number, ts: number): void {
    const midi = this.held.get(id);
    if (midi === undefined) return;
    this.held.delete(id);
    this.light(midi, false);
    this.handlers.onNoteOff(id, midi, ts);
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    const midi = this.midiAt(e.clientX, e.clientY);
    if (midi === null) return;
    this.root.setPointerCapture(e.pointerId);
    this.press(e.pointerId, midi, e.timeStamp);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.opts.glissando || !this.held.has(e.pointerId)) return;
    const midi = this.midiAt(e.clientX, e.clientY);
    if (midi === null || midi === this.held.get(e.pointerId)) return;
    this.release(e.pointerId, e.timeStamp);
    this.press(e.pointerId, midi, e.timeStamp);
  };

  private onUp = (e: PointerEvent): void => {
    this.release(e.pointerId, e.timeStamp);
  };
}
