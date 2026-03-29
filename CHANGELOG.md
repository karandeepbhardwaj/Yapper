# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-03-29

### Added

- **Platform-specific onboarding tutorial** — Windows 11 desktop/taskbar screenshots for the tutorial (macOS dock screenshots already existed); tutorial auto-selects based on platform
- **Windows title bar in tutorial** — "pasted" step shows Windows-style minimize/maximize/close buttons on Windows, macOS traffic lights on macOS
- **Sample data dev flag** — `YAPPER_SAMPLE_DATA=1 bun tauri dev` seeds 8 realistic history entries for development and demos
- **Tutorial GIFs** — `tutorial-mac.gif` and `tutorial-windows.gif` added to README

### Changed

- **Scroll performance** — GPU-composited scroll container (`will-change: scroll-position`, `transform: translateZ(0)`), `contain: layout style paint` on history cards, removed unnecessary Framer Motion wrapper from HistoryCard root element
- **Elastic overscroll disabled** — `overscroll-behavior: none` + `position: fixed` on html/body prevents WKWebView rubber-banding
- **Empty state locked** — scroll disabled when history is empty (no rubber-band revealing white background)

## [0.2.1] - 2026-03-29

### Changed

- **Landing page** — replaced mic icon + tagline with DM Serif Display "Yapper" heading + breathing dots and isomorphic 3D "Get Started" button
- **Widget tooltip** — simplified from "fn to dictate · ⌘⇧Y to yapp" to "press fn to yapp"
- **Widget positioning** — full-screen detection via `currentSystemPresentationOptions`; widget drops to screen bottom when dock is hidden in full-screen mode
- **Widget repositioning** — position calculation moved to main thread via `run_on_main_thread` for accurate `visibleFrame()` values on space/dock changes

### Fixed

- **Empty-state hotkey** — main window "Press {hotkey} and start yapping" message now updates when hotkey is changed in settings (added `hotkey-changed` event listener to `useSettings` hook)

## [0.2.0] - 2026-03-28

### Added

- **Conversation hotkey** — dedicated `Cmd+Shift+Y` (macOS) / `Ctrl+Shift+Y` (Windows) hotkey for starting conversation mode, configurable in settings
- **Recording mode setting** — "Press" (toggle, default) vs "Hold" (press-and-hold to record, release to stop)
- **Fn key hold mode** — Fn key release stops recording when using Hold recording mode (macOS)
- **Onboarding tutorial** — animated tutorial on empty state showing widget lifecycle, email paste workflow, and history screenshots (replaces sample data)
- **New app icon** — 3D isomorphic orange with DM Serif Display "Y"
- **DMG installer** — custom background with centered vertical layout
- **Bridge authentication** — random token written to `~/.yapper/bridge-token`, included in all WebSocket messages
- **Circuit breaker** — bridge connection fails 3 times then enters 30s cooldown, falling back to raw transcript immediately
- **Atomic file writes** — all persistence (history, dictionary, snippets, settings) uses write-to-tmp-then-rename pattern
- **Shared `store.rs` module** — generic JSON persistence with `load()`, `save()`, `data_path()`, and `uuid_simple()`
- **iOS-style transitions** — spring-based push/pop view transitions between app views
- **Settings back button** — iOS 26 style "< Back" in header instead of floating home button
- **Responsive tutorial viewer** — tutorial scales with window size
- **Widget tooltip** — shows both hotkeys: "fn to dictate . Cmd+Shift+Y to yapp"
- **New settings fields**: `recording_mode`, `conversation_hotkey` in `AppSettings`
- **New Tauri commands**: `change_recording_mode`, `change_conversation_hotkey`
- **`refinement-skipped` event** — emitted when bridge is unavailable, frontend can notify user

### Changed

- **Gemini API key** moved from URL query parameter to `x-goog-api-key` HTTP header (security fix)
- **All `println!` replaced** with `log` macros (`log::info!`, `log::error!`, etc.) for structured logging
- **Snippet matching** changed from naive substring to word boundary matching (prevents false positives)
- **Dictionary** now handles trailing punctuation (e.g., "hello." matches "hello" shorthand)
- **Conversation mode** triggered by dedicated hotkey instead of Y. button in the UI

### Removed

- **Y. conversation button** from the main window — replaced by conversation hotkey
- **Sample data** from empty state — replaced by onboarding tutorial

### Fixed

- All 22 findings from the multi-persona code review (REVIEW.md) addressed:
  - Predictable temp file paths for Swift STT scripts
  - Unauthenticated WebSocket bridge (now uses token auth)
  - Gemini API key exposed in URL (moved to header)
  - Unsafe `static mut` for Fn key AppHandle
  - Recording pipeline code duplication (extracted shared helper)
  - Silent refinement fallback (now emits event)
  - Snippet detection false positives (word boundary matching)
  - Non-atomic file writes (atomic via store.rs)
  - Version mismatch across monorepo (all 0.2.0)
  - Dictionary punctuation handling
  - Persistence module code duplication (shared store.rs)
  - Blocking bridge I/O with no circuit breaker (added circuit breaker)
  - All `println!` replaced with log macros

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
