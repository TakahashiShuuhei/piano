# piano 入力アプリ 設計

耳コピ力向上のためのツール。本ドキュメントは「1. 入力用機能」の設計。「2. メロディDB・検索」は別途。

- 用途: 自分用。端末は Android(Chrome)。スマホ横画面が主
- 目的: 知っている短いメロディを鍵盤で探す → 見つけたら録音して名前を付け、lifelog に保存する
- 公開: 既存の `TakahashiShuuhei.github.io` リポジトリ経由で GitHub Pages に公開(後述)

## 1. 技術構成

- Vite + TypeScript、フレームワークなし(画面が少ないため)
- `base: './'`(pianotrain と同じ。サブパス配下に置くため)
- 公開URL: `https://takahashishuuhei.github.io/apps/piano/`
- テスト: 純粋ロジック(録音の量子化、データ整形、outbox)を単体テストする。音と描画は手動確認

### デプロイ

pianotrain の `scripts/deploy.sh` と同じ方式にする。

1. `npm run build`
2. `dist/` を `TakahashiShuuhei.github.io/public/apps/piano/` にコピー
3. 公開リポジトリの master に push → 既存の Actions が Pages にデプロイ

## 2. 認証

- ページとビルド成果物は公開。コードにも成果物にも秘密を入れない
- 初回起動時に設定画面で **lifelog の API キーを貼り付け**、`localStorage` に保存する。キーを知っている自分だけが保存できる、というのが認証
- キーをコミットしない(`.env` を使う場合は `.gitignore` に入れる。履歴に残すと public では漏洩と同義)
- `life/api` への変更: CORS 追加(Hono の `cors` ミドルウェア)
  - 許可 Origin: `https://takahashishuuhei.github.io`
  - 許可ヘッダー: `content-type`, `x-api-key`
  - 現状は OPTIONS が 404 で、ブラウザから POST できない

## 3. 音

- Web Audio API。`OscillatorNode`(sawtooth / square を切替)+ `GainNode`
- `AudioContext` は `latencyHint: 'interactive'` で1つだけ作って使い回す。最初のタッチで `resume()`
- エンベロープ: アタック約3ms、短い減衰、リリース約60ms(リリースがないとクリックノイズが出る)
- 発音は `pointerdown`。`click` は使わない。鍵盤要素は `touch-action: none`
- 同時発音(和音)対応。ポインターIDごとに voice を持つ
- 設定で波形を切替。グリッサンド(鍵盤をなぞって隣の鍵を鳴らし直す)も設定で切替(初期値オフ)
- Android は iOS より遅延がやや大きい(20〜60ms)。設計上の対処は上記の使い回しのみ

## 4. 画面と操作

縦持ち・横持ちの両方に対応する。鍵盤は常に残りの領域いっぱいに表示する。

- **上部バー**: 録音ボタン、未送信件数、設定(⚙)
- **鍵盤**: 白鍵の「目標幅」(px)で画面に入る個数を決め、余りは均等に広げる(画面を回すと個数が変わる)。C の鍵に音名(C4 等)を表示
  - **縦持ちは2段**: 上段が高音、下段が低音(楽譜で高音部が上、低音部が下という慣習に合わせる)。各段が独立した最低音と ◀ ▶(1オクターブ移動)を持つ。鍵の幅は共通。初期値は下段 C3〜、上段 C4〜
  - **横持ちは1段**: 下段の設定を使い、上段は隠れる。録音は段によらず pointerId 単位で記録するので、段をまたいだ演奏も1つの録音になる
- **録音**: 状態は `idle → recording → review`
  - recording: 最初の1音を弾いた瞬間を t=0 とする(考えている無音は記録しない)。「1音戻す」でミスタップを取り消せる。停止ボタンで終了
  - review: 録音の**再生/停止ボタン**、**タイトル**と**メモ**の入力欄、**送信**と**破棄**。再生中は鳴っている鍵が点灯する。タイトルが空なら「無題 日時」で送る
  - 送信すると idle に戻る。送信に失敗しても outbox に残っているので録音は失われない
- **設定**(ダイアログ、変更は即反映・即保存):
  - lifelog APIキー
  - 白鍵の幅(28〜110px、初期値48)
  - 下段の最低音(横持ちはこの1段)と、上段の最低音(縦持ちのみ)。白鍵のみ。上限(C8)を超える場合は左に寄る
  - 音色(のこぎり波 / 矩形波 / 三角波)
  - 鍵盤をなぞって音を切り替える(グリッサンド、初期値オフ)

## 5. データモデル

録音中のイベントを、保存時に時間方向だけ粗く量子化して保存する。

```jsonc
{
  "type": "piano.melody",
  "data": {
    "melodyId": "uuid",             // クライアント生成
    "name": "ねこふんじゃった",
    "memo": "サビの出だし",
    "notes": [
      { "pitch": 60, "start": 0, "dur": 220 }  // pitch=MIDI番号, ms
    ],
    "synth": "sawtooth"
  },
  "tags": ["piano", "melody"],
  "schemaVersion": 1
}
```

- **音程は絶対値(MIDI番号)で保存する。** 相対音程(「5度上がる」等)は検索側で `pitch[i+1] - pitch[i]` から導出できる。逆は不可能
- **リズムは粗くてよい**(複雑なリズムは入力しない前提。主目的は音程の動き)
  - `start` / `dur` は ms を **10ms 単位に丸めて**保存する。BPM が不明な段階でビート単位に量子化すると誤りが固定されるため、ビート量子化・テンポ推定は検索・表示側で後からできるようにしておく
  - 指を置いている長さ(`dur`)は不安定なので、リズム情報としては `start`(onset)間隔を主とする。`dur` は再生用。最小 40ms
- **追記のみのAPIなので、更新・削除はイベントで表す。**
  - 編集: 同じ `melodyId` で再投稿し、新しい方を採用
  - 削除: `piano.melody_delete` `{ melodyId }` を投稿

## 6. 送信と outbox

- 保存操作 → まず outbox(`localStorage`、必要なら IndexedDB)に積む → `POST https://life-log-api-518385116466.asia-northeast1.run.app/logs`(ヘッダー `X-API-Key`)→ 201 なら outbox から削除
- 失敗(タイムアウト・非2xx・ネットワークエラー)時は outbox に残し、次回起動時・オンライン復帰時に再送。録音を失わないことを最優先
- 同じ `melodyId` の再送は最新を採用する運用なので、二重送信しても問題ない

## 7. PWA

- `manifest.webmanifest`(`display: fullscreen`、`orientation: any`、アイコン、`start_url` / `scope` は相対 `./`)
- 最小の Service Worker でアプリシェルをキャッシュし、電波がなくても起動できるようにする(outbox と相性が良い)。デプロイ時の古いキャッシュ残りを避けるため、キャッシュ名にビルド内容のハッシュを含める(`vite.config.ts` のプラグインが `sw.js` を生成する)。ページ本体はネットワーク優先、その他はキャッシュ優先

## 8. フェーズ2への備え(今回は作らない)

- 今の life-log-api は POST のみ。検索DBには `GET /logs?type=piano.melody` のような読み取り口が必要
- 保存形式(MIDI絶対値 + 粗い時間)で、音程間隔検索(例: 開始が完全5度上行、3度下行を含む)は導出可能

## 9. 実装状況

実装済み: 鍵盤・発音、録音 → 確認(再生)→ タイトル・メモ → 送信、outbox、設定、PWA、deploy スクリプト、`life/api` の CORS 追加(ローカル変更のみ。デプロイは未実施)。

動作確認が未了のもの: 実機(Android Chrome)での遅延・マルチタッチ・グリッサンド、実際の lifelog への POST(CORS 付きの API をデプロイしてから)。
