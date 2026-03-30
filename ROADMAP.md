# Yapper — Roadmap

## Completed

- [x] CI/CD pipeline (GitHub Actions: build macOS + Windows, release on tag)
- [x] Windows STT implementation — dual-engine: Classic (SAPI5 via PowerShell) + Modern (WinRT SpeechRecognizer)
- [x] Windows STT engine selection UI (Classic/Modern toggle in title bar, Windows only)
- [x] Windows speech permission detection (registry check) + setup tooltip with screenshot
- [x] Windows widget (DPI-aware positioning, hover, click detection via Win32 APIs)
- [x] Windows auto-paste (PowerShell Set-Clipboard + SendKeys)
- [x] Multi-provider LLM support (Groq, Gemini, Claude, Copilot)
- [x] Keyboard shortcut customization (physical key mapping via `e.code`)
- [x] Fn key as hotkey (macOS only) with setup tooltip
- [x] cocoa/objc/block -> objc2/objc2-app-kit/block2 migration
- [x] Settings persistence (hotkey + STT engine in settings.json, restored on startup)
- [x] Conversation hotkey — dedicated `Cmd+Shift+Y` / `Ctrl+Shift+Y`, configurable in settings
- [x] Recording modes — "Press" (toggle) and "Hold" (press-and-hold, Fn release on macOS)
- [x] Onboarding tutorial — animated tutorial on empty state (replaces sample data)
- [x] New app icon — 3D isomorphic orange with DM Serif Display "Y"
- [x] DMG installer with custom background
- [x] Bridge authentication — random token in `~/.yapper/bridge-token`
- [x] Circuit breaker — 3 failures → 30s cooldown on bridge connection
- [x] Atomic file writes — write-to-tmp-then-rename via shared `store.rs`
- [x] Gemini API key moved to `x-goog-api-key` header (security fix)
- [x] All `println!` replaced with structured `log` macros
- [x] Snippet word boundary matching (prevents false positives)
- [x] Dictionary trailing punctuation handling
- [x] iOS-style spring transitions between views
- [x] Settings back button (iOS 26 style "< Back")
- [x] Widget tooltip simplified to "press {hotkey} to yapp"
- [x] Landing page with DM Serif Display heading + breathing dots
- [x] Widget dock-aware positioning (full-screen detection, main thread execution)
- [x] Empty-state hotkey message updates dynamically via `hotkey-changed` event
- [x] Platform-specific onboarding tutorial (macOS dock / Windows 11 taskbar screenshots)
- [x] Sample data dev flag (`YAPPER_SAMPLE_DATA=1`)
- [x] GPU-composited scroll performance (will-change, contain, plain div cards)
- [x] Elastic overscroll disabled (WKWebView rubber-banding fix)
- [x] Tutorial GIFs in README (macOS + Windows)
- [x] Refinement-skipped event for user feedback
- [x] Full code review — all 22 REVIEW.md findings addressed

## v0.3.0 — Polish & Stability

- [ ] Automated test suite (Rust unit tests + Vitest for React components)
- [ ] Code signing for macOS distribution (Developer ID + notarization)
- [ ] Code signing for Windows (EV certificate)
- [ ] Auto-update support via Tauri's built-in updater
- [ ] Accessibility permission detection — show setup guide if not granted
- [ ] Microphone permission retry flow (currently requires app restart)
- [ ] Settings UI for locale selection (SFSpeechRecognizer supports 50+ locales)

## v0.4.0 — Enhanced Features

- [ ] Audio playback — listen back to original recording from history
- [ ] Export history as Markdown, JSON, or CSV
- [ ] Drag-to-reposition widget (persist position per screen)
- [ ] Multi-language STT (auto-detect or user-selected locale)
- [ ] Longer recording support (current: ~60s limit from SFSpeech, explore streaming)
- [ ] Interim transcript display in widget during recording
- [ ] Custom refinement instructions per category
- [ ] Tags and filtering in history dashboard

## v0.5.0 — Platform Expansion

- [ ] Linux support (PipeWire + Whisper.cpp or Vosk for offline STT)
- [ ] Tray icon with quick-access menu
- [ ] System notification on refinement complete

## v0.6.0 — Local AI

- [ ] On-device refinement via local LLM (Ollama, llama.cpp, MLX)
- [ ] Remove VS Code dependency for users without an LLM provider
- [ ] Prompt template editor for custom refinement behavior

## v1.0.0 — Production Ready

- [ ] App Store distribution (sandboxed, signed)
- [ ] Microsoft Store distribution
- [ ] Documentation site
- [ ] Plugin/extension API for custom refinement backends

## Ideas (Unscheduled)

- Voice commands ("delete last sentence", "new paragraph", "send as email")
- Speaker diarization (multi-speaker transcripts)
- Whisper.cpp integration as alternative to platform STT
- Dictation mode (continuous, real-time paste as you speak)
- Team features (shared refinement templates, shared history)
- Mobile companion app (record on phone, refine on desktop)
- Browser extension (capture from web forms)
