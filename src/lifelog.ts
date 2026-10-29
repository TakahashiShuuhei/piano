import type { Note } from "./recorder";

const LOGS_URL = "https://life-log-api-518385116466.asia-northeast1.run.app/logs";
const TIMEOUT_MS = 8000;

export interface LogEntry {
  type: string;
  data: Record<string, unknown>;
  tags: string[];
  schemaVersion: number;
}

export type SendResult = { ok: true } | { ok: false; message: string };

export interface MelodyInput {
  melodyId: string;
  name: string;
  memo: string;
  notes: Note[];
  synth: string;
}

export function buildMelodyLog(m: MelodyInput): LogEntry {
  return {
    type: "piano.melody",
    data: { melodyId: m.melodyId, name: m.name, memo: m.memo, notes: m.notes, synth: m.synth },
    tags: ["piano", "melody"],
    schemaVersion: 1,
  };
}

export async function postLog(apiKey: string, entry: LogEntry): Promise<SendResult> {
  if (!apiKey) return { ok: false, message: "APIキーが未設定です" };
  try {
    const res = await fetch(LOGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, message: "APIキーが違います (401)" };
    return { ok: false, message: `送信に失敗しました (${res.status})` };
  } catch {
    return { ok: false, message: "通信に失敗しました" };
  }
}
