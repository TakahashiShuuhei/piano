#!/usr/bin/env bash
# ビルド済み静的ファイルを別リポジトリ(TakahashiShuuhei.github.io)にコピーし、
# masterにpushしてGitHub Pagesへの自動デプロイを発火させる(pianotrain と同じ方式)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_REPO="/home/shuhei/git/TakahashiShuuhei.github.io"
TARGET_DIR="$TARGET_REPO/public/apps/piano"
COMMIT_MESSAGE="${1:-Deploy piano}"

if [ ! -d "$TARGET_REPO/.git" ]; then
  echo "デプロイ先リポジトリが見つかりません: $TARGET_REPO" >&2
  exit 1
fi

echo "==> ビルド中..."
cd "$REPO_ROOT"
npm run build

echo "==> $TARGET_DIR を更新中..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -r dist/. "$TARGET_DIR"/

echo "==> コミット・push中..."
cd "$TARGET_REPO"
git add public/apps/piano

if git diff --cached --quiet; then
  echo "デプロイ対象に差分がありません。終了します。"
  exit 0
fi

git commit -m "$COMMIT_MESSAGE"
git push origin master

echo "==> デプロイ完了"
