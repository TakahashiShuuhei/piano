import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// public/ からそのままコピーされるファイル(ハッシュ名ではないので内容でバージョンを決める)
const STATIC_FILES = ["manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];

// ビルド成果物の一覧を埋め込んだ sw.js を出力する。
// ファイル一覧・内容が変わるとキャッシュ名が変わり、古いキャッシュは activate で消える。
function serviceWorker(): Plugin {
  return {
    name: "piano-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const files = ["./", ...Object.keys(bundle), ...STATIC_FILES];
      const hash = createHash("sha1");
      for (const f of Object.keys(bundle).sort()) hash.update(f);
      for (const f of STATIC_FILES) hash.update(readFileSync(resolve("public", f)));
      const version = `piano-${hash.digest("hex").slice(0, 10)}`;

      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // ページ本体はネットワーク優先(デプロイ後に新しい版が出るように)、圏外ならキャッシュ
    e.respondWith(fetch(req).catch(() => caches.match(self.registration.scope)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`,
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
