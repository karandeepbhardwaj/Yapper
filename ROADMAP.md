# Yapper — Roadmap

## v0.1.0 — Polish & Stability

- [ ] Automated test suite (Rust unit tests + Vitest for React components)
- [ ] CI/CD pipeline (GitHub Actions: lint, build, test, release)
- [ ] Code signing for macOS distribution (Developer ID + notarization)
- [ ] Auto-update support via Tauri's built-in updater
- [ ] Accessibility permission detection — show setup guide if not granted
- [ ] Microphone permission retry flow (currently requires app restart)
- [ ] Settings UI for style preference (Professional/Casual/Technical/Creative)
- [ ] Settings UI for locale selection (SFSpeechRecognizer supports 50+ locales)
- [ ] Keyboard shortcut customization

## v0.2.0 — Enhanced Features

- [ ] Audio playback — listen back to original recording from history
- [ ] Export history as Markdown, JSON, or CSV
- [ ] Drag-to-reposition widget (persist position per screen)
- [ ] Multi-language STT (auto-detect or user-selected locale)
- [ ] Longer recording support (current: ~60s limit from SFSpeech, explore streaming)
- [ ] Interim transcript display in widget during recording
- [ ] Custom refinement instructions per category
- [ ] Tags and filtering in history dashboard

## v0.3.0 — Platform Expansion

- [ ] Windows STT implementation (Windows.Media.SpeechRecognition)
- [ ] Linux support (PipeWire + Whisper.cpp or Vosk for offline STT)
- [ ] Tray icon with quick-access menu
- [ ] System notification on refinement complete

## v0.4.0 — Local AI

- [ ] On-device refinement via local LLM (Ollama, llama.cpp, MLX)
- [ ] Remove VS Code dependency for users without Copilot
- [ ] Custom model selection (choose between Copilot, local LLM, or raw)
- [ ] Prompt template editor for custom refinement behavior

## v1.0.0 — Production Ready

- [ ] App Store distribution (sandboxed, signed)
- [ ] Onboarding wizard (permissions, VS Code setup, test recording)
- [ ] Usage analytics (opt-in, local-only)
- [ ] Plugin/extension API for custom refinement backends
- [ ] Documentation site
- [ ] Stable API for third-party integrations

## Ideas (Unscheduled)

- Voice commands ("delete last sentence", "new paragraph", "send as email")
- Speaker diarization (multi-speaker transcripts)
- Whisper.cpp integration as alternative to SFSpeechRecognizer
- Dictation mode (continuous, real-time paste as you speak)
- Team features (shared refinement templates, shared history)
- Mobile companion app (record on phone, refine on desktop)
- Browser extension (capture from web forms)
