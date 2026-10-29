import type { LogEntry, SendResult } from "./lifelog";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FlushResult {
  sent: number;
  remaining: number;
  error?: string;
}

const STORAGE_KEY = "piano-outbox-v1";

// 送信前に必ずここへ積み、成功したものだけ取り除く(録音を失わないための仕組み)。
export class Outbox {
  private entries: LogEntry[];
  private flushing: Promise<FlushResult> | null = null;

  constructor(
    private store: KeyValueStore,
    private send: (entry: LogEntry) => Promise<SendResult>,
  ) {
    this.entries = this.load();
  }

  get size(): number {
    return this.entries.length;
  }

  add(entry: LogEntry): void {
    this.entries.push(entry);
    this.persist();
  }

  // 先頭から順に送り、最初の失敗で止める。同時に複数回呼ばれても送信は1本だけ。
  flush(): Promise<FlushResult> {
    this.flushing ??= this.run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async run(): Promise<FlushResult> {
    let sent = 0;
    while (this.entries.length > 0) {
      const result = await this.send(this.entries[0]);
      if (!result.ok) return { sent, remaining: this.entries.length, error: result.message };
      this.entries.shift();
      this.persist();
      sent++;
    }
    return { sent, remaining: 0 };
  }

  private load(): LogEntry[] {
    try {
      const parsed: unknown = JSON.parse(this.store.getItem(STORAGE_KEY) ?? "[]");
      return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // 保存できない場合もメモリ上には残る
    }
  }
}
