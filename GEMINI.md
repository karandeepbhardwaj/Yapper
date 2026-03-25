# Yapper — Gemini CLI Instructions

Read `AGENTS.md` for full project guidelines. This file extends those instructions for Gemini CLI.

## Project

Yapper is a Tauri v2 desktop app (Rust + React 18) for voice-to-text with AI refinement via GitHub Copilot.

## Key Rules

- Zero network egress from the desktop app
- Widget runs in a separate webview — communicate via Tauri events, not shared state
- All AppKit calls must happen on the main thread
- Don't use enigo for keyboard simulation on macOS — it crashes
- macOS uses `objc2` + `objc2-app-kit` + `block2` (NOT deprecated `cocoa`/`objc`)
- No Co-Authored-By lines in git commits
- Stage specific files when committing (never `git add -A`)

## Commands

```bash
pnpm dev                    # Dev mode (Vite + Tauri)
pnpm tauri build            # Production build (.dmg)
cargo check                 # Verify Rust compiles
cd extensions/vscode-bridge && npm run compile  # Build VS Code extension
```

## Architecture

See `DESIGN.md` for full architecture diagram and pipeline description.
See `CLAUDE.md` for detailed file guide and common pitfalls.
