# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2026-03-25

### Added

- Windows dual-engine STT: Classic (SAPI5 via PowerShell, offline) and Modern (WinRT, higher accuracy)
- STT engine selection toggle in title bar (Windows only) with animated sliding highlight pill
- Speech permission detection via Windows registry (`OnlineSpeechPrivacy\HasAccepted`)
- Setup tooltip with screenshot when switching to Modern engine without the privacy setting enabled
- `change_stt_engine` and `check_speech_permission` Tauri commands
- STT engine preference persistence in `settings.json`, restored on app startup
- `debug_log` Tauri command for frontend-to-backend debug tracing
- `AppSettings.stt_engine` field with `#[serde(default)]` for backward compatibility

### Fixed

- Hotkey change not working: parameter name mismatch between JS (`hotkey`) and Rust (`hotkey_str`) caused the command to silently fail
- Hotkey recording now uses `e.code` (physical key) instead of `e.key` to prevent Shift modifying key values (e.g., Shift+/ producing "?" instead of "/")
- SAPI5 race condition: `stop_recognition` could be called while `start_recognition` was still initializing the PowerShell subprocess
- SAPI5 empty transcripts: removed overly strict confidence threshold (was rejecting speech at 0.187 confidence)
- SAPI5 `RecognizeAsyncStop()` used instead of `RecognizeAsyncCancel()` to process pending audio
- Settings clobbering: `change_hotkey` now reads existing settings before writing to preserve `stt_engine` field
- STT toggle animation no longer shakes adjacent hotkey text (`layout="position"` instead of bare `layout`)

## [0.0.4] - 2026-03-22

### Fixed

- Category and title from Copilot refinement now persist to history.json (were lost on restart)
- Pin status now persists across app restarts via new `toggle_pin_item` backend command
- Added configurable model selection (`yapper.modelFamily` VS Code setting), defaults to gpt-4o-mini
- Fixed VSIX not bundling `ws` dependency (now uses esbuild to produce a single-file extension)

## [0.0.3] - 2026-03-22

### Changed

- Removed 48 unused shadcn/ui components and orphaned files (FloatingWidget, ImageWithFallback)
- Removed 30 unused npm dependencies (emotion, radix-ui, recharts, sonner, vaul, date-fns, etc.)
- Removed unused `enigo` crate from Rust dependencies; replaced with PowerShell-based paste on Windows
- Removed unused `tw-animate-css` package and cleaned up theme.css (removed ~100 unused CSS variables)
- Enabled strict TypeScript checks (noUnusedLocals, noUnusedParameters)
- Fixed `copyTimer` in HistoryCard to use `useRef` instead of misused `useState`
- Fixed Web Speech API type declarations conflicting with DOM built-ins

### Fixed

- Reduced frontend bundle dependencies from 62 to 8 production packages
- Reduced node_modules by 155 packages

## [0.0.2] - 2026-03-22

### Changed

- Added design docs and AI agent configuration files
- Minor history and hotkey improvements

## [0.0.1] - 2026-03-22

### Added

- Initial release
- macOS desktop app with floating widget
- Speech-to-text via macOS SFSpeechRecognizer
- AI transcript refinement via GitHub Copilot (VS Code extension bridge)
- Auto-paste refined text at cursor
- History dashboard with bento grid layout
- Dark/light mode
- Fuzzy search (Fuse.js)
- Pin/copy/expand history cards
- Global hotkey (Cmd+Shift+.)
- Widget follows across macOS Spaces
- Landing/onboarding page
