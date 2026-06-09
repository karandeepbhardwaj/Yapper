#!/usr/bin/env bash
# Provision the bundled, offline assets at build time so they ship inside the
# app (runtime needs no internet). Everything fetched here is git-ignored.
#
#   1. Whisper STT model      -> resources/models/ggml-tiny.bin
#   2. Ollama server runtime  -> resources/ollama/
#   3. Refinement LLM         -> resources/ollama-models/  (qwen2.5:0.5b)
#
# Run before `bun tauri build`. Currently provisions the macOS runtime.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES="$ROOT/src-tauri/resources"
mkdir -p "$RES/models" "$RES/ollama" "$RES/ollama-models"

# 1. Whisper model -----------------------------------------------------------
WHISPER="ggml-tiny.bin"
if [ -f "$RES/models/$WHISPER" ]; then
  echo "[fetch] $WHISPER present — skipping."
else
  echo "[fetch] Downloading $WHISPER ..."
  curl -fL --retry 3 -o "$RES/models/$WHISPER" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER"
fi

# 2. Ollama runtime (macOS) --------------------------------------------------
if [ -x "$RES/ollama/ollama" ]; then
  echo "[fetch] ollama runtime present — skipping."
else
  echo "[fetch] Downloading ollama-darwin.tgz ..."
  TMP="$(mktemp -d)"
  curl -fL --retry 3 -o "$TMP/ollama-darwin.tgz" \
    "https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz"
  tar -xzf "$TMP/ollama-darwin.tgz" -C "$RES/ollama"
  rm -rf "$TMP"
fi

# 3. Refinement model (pulled into the bundled store) ------------------------
MODEL="qwen2.5:0.5b"
if [ -d "$RES/ollama-models/manifests" ] && \
   find "$RES/ollama-models/manifests" -path '*qwen2.5*' | grep -q .; then
  echo "[fetch] $MODEL present — skipping."
else
  echo "[fetch] Pulling $MODEL into bundled model store ..."
  OLLAMA_MODELS="$RES/ollama-models" OLLAMA_HOST=127.0.0.1:11455 \
    "$RES/ollama/ollama" serve >/tmp/yapper-fetch-ollama.log 2>&1 &
  SERVE_PID=$!
  # wait for server, then pull, then stop it
  for _ in $(seq 1 30); do
    curl -s http://127.0.0.1:11455/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
  OLLAMA_HOST=127.0.0.1:11455 "$RES/ollama/ollama" pull "$MODEL"
  kill "$SERVE_PID" 2>/dev/null || true
fi

echo "[fetch] Done. Bundled assets ready under $RES"
