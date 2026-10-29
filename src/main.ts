import "./style.css";
import { Keyboard } from "./keyboard";
import { buildMelodyLog, postLog } from "./lifelog";
import { ALL_WHITE_KEYS, noteName, shiftLowest } from "./music";
import { Outbox } from "./outbox";
import { Recorder, type Note } from "./recorder";
import {
  KEY_WIDTH_MAX,
  KEY_WIDTH_MIN,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
import { Synth, type Waveform } from "./synth";

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const settings: Settings = loadSettings();
const synth = new Synth();
synth.waveform = settings.waveform;
const recorder = new Recorder();
const outbox = new Outbox(localStorage, (entry) => postLog(settings.apiKey, entry));

type Phase = "idle" | "recording" | "review";
let phase: Phase = "idle";
let pending: Note[] = [];

// ---- 通知 ----
const toastEl = $("toast");
let toastTimer = 0;
function toast(text: string, ms = 4000): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), ms);
}

// ---- 鍵盤 ----
// 縦持ちは上段(高音)+下段(低音)、横持ちは下段のみ表示される(CSSで切替)。
// 同時押しなどの pointerId は端末全体で一意なので、段をまたいでも synth/recorder はそのまま使える。
type LowestKey = "lowest" | "lowestUpper";

interface Manual {
  kb: Keyboard;
  key: LowestKey;
}

function createManual(sectionId: string, key: LowestKey): Manual {
  const section = $(sectionId);
  const label = section.querySelector<HTMLElement>(".range-label")!;
  const kb = new Keyboard(
    section.querySelector<HTMLElement>(".keyboard")!,
    { lowest: settings[key], keyWidth: settings.keyWidth, glissando: settings.glissando },
    {
      onNoteOn(id, midi, ts) {
        synth.noteOn(id, midi);
        recorder.noteOn(id, midi, ts);
        if (recorder.recording) $("rec-status").textContent = `録音中 ${recorder.count}音`;
      },
      onNoteOff(id, _midi, ts) {
        synth.noteOff(id);
        recorder.noteOff(id, ts);
      },
      onLayout(lowest, highest) {
        label.textContent = `${noteName(lowest)} – ${noteName(highest)}`;
      },
    },
  );
  const manual: Manual = { kb, key };
  for (const btn of section.querySelectorAll<HTMLButtonElement>("button.oct")) {
    btn.addEventListener("click", () => shiftOctave(manual, Number(btn.dataset.dir) as 1 | -1));
  }
  return manual;
}

const upper = createManual("manual-upper", "lowestUpper");
const lower = createManual("manual-lower", "lowest");
const manuals = [upper, lower];

function shiftOctave(m: Manual, dir: 1 | -1): void {
  m.kb.setOptions({ lowest: shiftLowest(m.kb.lowestMidi, dir * 7) });
  settings[m.key] = m.kb.lowestMidi;
  saveSettings(settings);
  syncSettingsForm();
}

function lightAll(midi: number, on: boolean): void {
  for (const m of manuals) m.kb.light(midi, on);
}

// 最初の操作で AudioContext を起こしておく(初回の発音の遅れを減らす)。
window.addEventListener("pointerdown", () => synth.unlock(), { once: true, capture: true });
window.addEventListener("blur", () => {
  synth.allOff();
  for (const m of manuals) m.kb.releaseAll(performance.now());
});

// ---- 画面状態 ----
function render(): void {
  $("rec-start").hidden = phase !== "idle";
  $("rec-stop").hidden = phase !== "recording";
  $("rec-undo").hidden = phase !== "recording";
  $("review").hidden = phase !== "review";
  $("rec-status").textContent = phase === "recording" ? "録音中 最初の音から記録します" : "";
}

function renderOutbox(): void {
  const badge = $<HTMLButtonElement>("outbox-badge");
  badge.hidden = outbox.size === 0;
  badge.textContent = `未送信 ${outbox.size}`;
}

$("rec-start").addEventListener("click", () => {
  stopPlayback();
  recorder.start();
  phase = "recording";
  render();
});

$("rec-undo").addEventListener("click", () => {
  recorder.undoLast();
  $("rec-status").textContent =
    recorder.count === 0 ? "録音中 最初の音から記録します" : `録音中 ${recorder.count}音`;
});

$("rec-stop").addEventListener("click", () => {
  pending = recorder.stop(performance.now());
  if (pending.length === 0) {
    phase = "idle";
    render();
    toast("音が入力されていません");
    return;
  }
  const seconds = (Math.max(...pending.map((n) => n.start + n.dur)) / 1000).toFixed(1);
  $("review-info").textContent = `${pending.length}音 / ${seconds}秒`;
  $<HTMLInputElement>("title").value = "";
  $<HTMLTextAreaElement>("memo").value = "";
  phase = "review";
  render();
});

// ---- 再生 ----
let playing = false;
let playTimers: number[] = [];
const playBtn = $<HTMLButtonElement>("play");

function stopPlayback(): void {
  if (!playing) return;
  playing = false;
  synth.stopPlayback();
  for (const t of playTimers) clearTimeout(t);
  playTimers = [];
  for (const n of pending) lightAll(n.pitch, false);
  playBtn.textContent = "▶ 再生";
}

function startPlayback(): void {
  if (pending.length === 0) return;
  playing = true;
  playBtn.textContent = "■ 停止";
  const lead = 0.08;
  let end = 0;
  for (const n of pending) {
    synth.playNote(n.pitch, lead + n.start / 1000, n.dur / 1000);
    const on = window.setTimeout(() => lightAll(n.pitch, true), lead * 1000 + n.start);
    const off = window.setTimeout(() => lightAll(n.pitch, false), lead * 1000 + n.start + n.dur);
    playTimers.push(on, off);
    end = Math.max(end, n.start + n.dur);
  }
  playTimers.push(
    window.setTimeout(() => {
      // 全 off タイマーは終了前に発火済み。UI だけ戻す。
      playing = false;
      playTimers = [];
      playBtn.textContent = "▶ 再生";
    }, lead * 1000 + end + 100),
  );
}

playBtn.addEventListener("click", () => (playing ? stopPlayback() : startPlayback()));

// ---- 破棄・送信 ----
$("discard").addEventListener("click", () => {
  if (!confirm("録音を破棄しますか?")) return;
  stopPlayback();
  pending = [];
  phase = "idle";
  render();
});

function defaultName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `無題 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const sendBtn = $<HTMLButtonElement>("send");
sendBtn.addEventListener("click", async () => {
  stopPlayback();
  sendBtn.disabled = true;
  try {
    outbox.add(
      buildMelodyLog({
        melodyId: crypto.randomUUID(),
        name: $<HTMLInputElement>("title").value.trim() || defaultName(),
        memo: $<HTMLTextAreaElement>("memo").value.trim(),
        notes: pending,
        synth: synth.waveform,
      }),
    );
    pending = [];
    phase = "idle";
    render();
    renderOutbox();
    const result = await outbox.flush();
    renderOutbox();
    if (result.remaining === 0) {
      toast("送信しました");
    } else {
      toast(`${result.error ?? "送信に失敗しました"}。未送信として保存しました`, 6000);
      if (!settings.apiKey) openSettings();
    }
  } finally {
    sendBtn.disabled = false;
  }
});

async function retryOutbox(quiet: boolean): Promise<void> {
  if (outbox.size === 0 || !settings.apiKey) return;
  const result = await outbox.flush();
  renderOutbox();
  if (quiet && result.sent === 0) return;
  toast(
    result.remaining === 0
      ? `未送信分を送信しました (${result.sent}件)`
      : `${result.error ?? "送信に失敗しました"} (残り${result.remaining}件)`,
    5000,
  );
}
$("outbox-badge").addEventListener("click", () => {
  if (!settings.apiKey) {
    openSettings();
    return;
  }
  void retryOutbox(false);
});
window.addEventListener("online", () => void retryOutbox(true));

// ---- 設定 ----
const dialog = $<HTMLDialogElement>("settings");
const apiKeyInput = $<HTMLInputElement>("set-apikey");
const keyWidthInput = $<HTMLInputElement>("set-keywidth");
const lowestSelect = $<HTMLSelectElement>("set-lowest");
const lowestUpperSelect = $<HTMLSelectElement>("set-lowest-upper");

keyWidthInput.min = String(KEY_WIDTH_MIN);
keyWidthInput.max = String(KEY_WIDTH_MAX);
for (const select of [lowestSelect, lowestUpperSelect]) {
  for (const midi of ALL_WHITE_KEYS) {
    const opt = document.createElement("option");
    opt.value = String(midi);
    opt.textContent = noteName(midi);
    select.appendChild(opt);
  }
}

function syncSettingsForm(): void {
  apiKeyInput.value = settings.apiKey;
  keyWidthInput.value = String(settings.keyWidth);
  $("set-keywidth-out").textContent = String(settings.keyWidth);
  lowestSelect.value = String(settings.lowest);
  lowestUpperSelect.value = String(settings.lowestUpper);
  $<HTMLSelectElement>("set-waveform").value = settings.waveform;
  $<HTMLInputElement>("set-gliss").checked = settings.glissando;
}

function openSettings(): void {
  syncSettingsForm();
  dialog.showModal();
}
$("open-settings").addEventListener("click", openSettings);

apiKeyInput.addEventListener("input", () => {
  settings.apiKey = apiKeyInput.value.trim();
  saveSettings(settings);
});
dialog.addEventListener("close", () => void retryOutbox(true));

keyWidthInput.addEventListener("input", () => {
  settings.keyWidth = Number(keyWidthInput.value);
  $("set-keywidth-out").textContent = String(settings.keyWidth);
  for (const m of manuals) m.kb.setOptions({ keyWidth: settings.keyWidth });
  saveSettings(settings);
});
function bindLowestSelect(select: HTMLSelectElement, m: Manual): void {
  select.addEventListener("change", () => {
    m.kb.setOptions({ lowest: Number(select.value) });
    settings[m.key] = m.kb.lowestMidi; // 上限で左に寄ったあとの値
    select.value = String(settings[m.key]);
    saveSettings(settings);
  });
}
bindLowestSelect(lowestSelect, lower);
bindLowestSelect(lowestUpperSelect, upper);
$("set-waveform").addEventListener("change", (e) => {
  settings.waveform = (e.target as HTMLSelectElement).value as Waveform;
  synth.waveform = settings.waveform;
  saveSettings(settings);
});
$("set-gliss").addEventListener("change", (e) => {
  settings.glissando = (e.target as HTMLInputElement).checked;
  for (const m of manuals) m.kb.setOptions({ glissando: settings.glissando });
  saveSettings(settings);
});

// ---- 起動 ----
render();
renderOutbox();
void retryOutbox(true);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // オフライン起動ができないだけなので無視
  });
}
