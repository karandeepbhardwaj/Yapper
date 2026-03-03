#!/usr/bin/env bash
# Provision the bundled, offline assets at build time so they ship inside the
# app (runtime needs no internet). Everything fetched here is git-ignored.
#
#   1. Whisper STT model      -> resources/models/ggml-tiny.bin   (OS-agnostic)
#   2. Ollama server runtime  -> resources/ollama/                (per-OS)
#   3. Refinement LLM         -> resources/ollama-models/  (qwen2.5:0.5b, OS-agnostic)
#
# Run before `bun tauri build` ON the target OS (macOS build on macOS, Windows
# build on Windows under Git Bash / MSYS). Detects the OS and fetches the right
# Ollama runtime; the model store and Whisper model are platform-independent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES="$ROOT/src-tauri/resources"
mkdir -p "$RES/models" "$RES/ollama" "$RES/ollama-models"

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *) echo "[fetch] Unsupported build OS: $OS" >&2; exit 1 ;;
esac
echo "[fetch] Building bundled assets for: $PLATFORM"

# 1. Whisper model (same on every platform) ----------------------------------
WHISPER="ggml-tiny.bin"
if [ -f "$RES/models/$WHISPER" ]; then
  echo "[fetch] $WHISPER present — skipping."
else
  echo "[fetch] Downloading $WHISPER ..."
  curl -fL --retry 3 -o "$RES/models/$WHISPER" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER"
fi

# 2. Ollama runtime (per-OS) -------------------------------------------------
OLLAMA_BIN="ollama"; [ "$PLATFORM" = "windows" ] && OLLAMA_BIN="ollama.exe"
if [ -x "$RES/ollama/$OLLAMA_BIN" ] || [ -f "$RES/ollama/$OLLAMA_BIN" ]; then
  echo "[fetch] ollama runtime present — skipping."
else
  TMP="$(mktemp -d)"
  if [ "$PLATFORM" = "macos" ]; then
    echo "[fetch] Downloading ollama-darwin.tgz ..."
    curl -fL --retry 3 -o "$TMP/ollama.tgz" \
      "https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz"
    tar -xzf "$TMP/ollama.tgz" -C "$RES/ollama"
  else
    echo "[fetch] Downloading ollama-windows-amd64.zip ..."
    curl -fL --retry 3 -o "$TMP/ollama.zip" \
      "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip"
    unzip -q "$TMP/ollama.zip" -d "$RES/ollama"
    # The Windows release bundles CUDA/ROCm GPU runners (~1.3 GB). Drop them to
    # keep the CPU-only bundle small; ollama falls back to CPU automatically.
    find "$RES/ollama/lib/ollama" -maxdepth 1 -type d \
      \( -iname 'cuda*' -o -iname 'rocm*' -o -iname '*cuda*' -o -iname '*rocm*' \) \
      -exec rm -rf {} + 2>/dev/null || true
  fi
  rm -rf "$TMP"
fi

# 3. Refinement model (OS-agnostic blobs) ------------------------------------
MODEL="qwen2.5:0.5b"
if [ -d "$RES/ollama-models/manifests" ] && \
   find "$RES/ollama-models/manifests" -path '*qwen2.5*' | grep -q .; then
  echo "[fetch] $MODEL present — skipping."
else
  echo "[fetch] Pulling $MODEL into bundled model store ..."
  OLLAMA_MODELS="$RES/ollama-models" OLLAMA_HOST=127.0.0.1:11455 \
    "$RES/ollama/$OLLAMA_BIN" serve >/tmp/yapper-fetch-ollama.log 2>&1 &
  SERVE_PID=$!
  for _ in $(seq 1 30); do
    curl -s http://127.0.0.1:11455/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
  OLLAMA_HOST=127.0.0.1:11455 "$RES/ollama/$OLLAMA_BIN" pull "$MODEL"
  kill "$SERVE_PID" 2>/dev/null || true
fi

echo "[fetch] Done. Bundled assets ready under $RES"
