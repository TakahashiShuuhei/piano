import { describe, expect, it } from "vitest";
import type { LogEntry, SendResult } from "./lifelog";
import { Outbox, type KeyValueStore } from "./outbox";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const entry = (name: string): LogEntry => ({
  type: "piano.melody",
  data: { name },
  tags: [],
  schemaVersion: 1,
});

describe("Outbox", () => {
  it("送信成功したものは取り除く", async () => {
    const sent: string[] = [];
    const box = new Outbox(memoryStore(), async (e) => {
      sent.push(e.data.name as string);
      return { ok: true };
    });
    box.add(entry("a"));
    box.add(entry("b"));
    expect(await box.flush()).toEqual({ sent: 2, remaining: 0 });
    expect(sent).toEqual(["a", "b"]);
    expect(box.size).toBe(0);
  });

  it("失敗したら残し、そこで止める", async () => {
    let calls = 0;
    const box = new Outbox(memoryStore(), async (): Promise<SendResult> => {
      calls++;
      return calls === 1 ? { ok: true } : { ok: false, message: "通信に失敗しました" };
    });
    box.add(entry("a"));
    box.add(entry("b"));
    box.add(entry("c"));
    expect(await box.flush()).toEqual({ sent: 1, remaining: 2, error: "通信に失敗しました" });
    expect(calls).toBe(2);
  });

  it("再起動しても未送信分が残る", async () => {
    const store = memoryStore();
    const fail = async (): Promise<SendResult> => ({ ok: false, message: "x" });
    const box1 = new Outbox(store, fail);
    box1.add(entry("a"));
    await box1.flush();

    const box2 = new Outbox(store, async () => ({ ok: true }));
    expect(box2.size).toBe(1);
    expect(await box2.flush()).toEqual({ sent: 1, remaining: 0 });
    expect(new Outbox(store, fail).size).toBe(0);
  });

  it("flush が同時に呼ばれても送信は1本だけ", async () => {
    let calls = 0;
    const box = new Outbox(memoryStore(), async () => {
      calls++;
      await Promise.resolve();
      return { ok: true };
    });
    box.add(entry("a"));
    await Promise.all([box.flush(), box.flush()]);
    expect(calls).toBe(1);
  });

  it("壊れた保存データでも落ちない", () => {
    const store = memoryStore();
    store.setItem("piano-outbox-v1", "{not json");
    expect(new Outbox(store, async () => ({ ok: true })).size).toBe(0);
  });
});
