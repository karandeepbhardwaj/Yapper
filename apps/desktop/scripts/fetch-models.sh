#!/usr/bin/env bash
# Fetch the bundled models at build time so they ship inside the app
# (runtime is fully offline). Binaries are git-ignored, not committed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="$ROOT/src-tauri/resources/models"
mkdir -p "$MODELS_DIR"

WHISPER_MODEL="ggml-tiny.bin"
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL}"

if [ -f "$MODELS_DIR/$WHISPER_MODEL" ]; then
  echo "[fetch-models] $WHISPER_MODEL already present — skipping."
else
  echo "[fetch-models] Downloading $WHISPER_MODEL ..."
  curl -fL --retry 3 -o "$MODELS_DIR/$WHISPER_MODEL" "$WHISPER_URL"
  echo "[fetch-models] Saved to $MODELS_DIR/$WHISPER_MODEL"
fi
