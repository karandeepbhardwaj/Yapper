# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
