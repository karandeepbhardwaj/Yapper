# Contributing to Yapper

Thanks for your interest in contributing to Yapper! This guide will help you get set up and submit your first pull request.

---

## Development Environment Setup

### Prerequisites

- **Rust** 1.75+ ([rustup.rs](https://rustup.rs))
- **Node.js** 20+ ([nodejs.org](https://nodejs.org))
- **pnpm** 9+ (`npm install -g pnpm`)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Visual Studio Build Tools with C++ workload
- **VS Code** with the Yapper Bridge extension (for testing refinement)

### Clone & Install

```bash
git clone https://github.com/karandeepbhardwaj/Yapper.git
cd Yapper
pnpm install
```

---

## Running in Dev Mode

### Desktop App

```bash
# Start the Tauri dev server with hot reload
pnpm tauri dev
```

This launches both the Vite frontend dev server and the Rust backend simultaneously.

### VS Code Extension

```bash
cd extensions/vscode-bridge
npm install
npm run compile
```

Then press **F5** in VS Code (with the extension folder open) to launch an Extension Development Host for testing.

---

## Code Style

### Rust

- Follow standard Rust formatting: run `cargo fmt` before committing
- Run `cargo clippy` and address all warnings
- Use `#[cfg(target_os = "...")]` for platform-specific code
- macOS interop uses `objc2` + `objc2-app-kit` + `block2` (NOT `cocoa`/`objc`)
- Windows interop uses the `windows` crate

### TypeScript

- Use TypeScript strict mode (already configured in `tsconfig.json`)
- Follow the existing project conventions (functional components, hooks)
- Use `const` by default; `let` only when reassignment is needed
- Prefer named exports over default exports

### General

- No `console.log` in production code (use proper logging)
- Keep files focused -- one component/module per file
- Write descriptive commit messages (see below)
- Stage specific files (not `git add -A`)
- Don't add `Co-Authored-By` lines to commits

---

## Project Structure

```
apps/desktop/
  src/                     — React frontend
  src-tauri/src/
    lib.rs                 — Entry point (~44 lines)
    commands.rs            — All Tauri commands
    widget/                — Platform-specific widget code
    stt/                   — Platform-specific STT code
    bridge.rs              — WebSocket client
    hotkey.rs              — Global shortcuts
    history.rs             — History persistence
    autopaste.rs           — Cross-platform paste

extensions/vscode-bridge/  — VS Code extension (multi-provider LLM)
```

---

## Submitting Pull Requests

1. **Fork the repository** and create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```

2. **Make your changes** with clear, atomic commits:
   ```
   feat: add silence detection threshold setting
   fix: resolve widget flicker on Space transition
   docs: update README with new hotkey
   ```

3. **Test your changes**:
   - Run `pnpm tauri dev` and verify the desktop app works
   - If you changed the VS Code extension, test with the Extension Development Host
   - Run `cargo clippy` and `cargo fmt --check` for Rust changes

4. **Push your branch** and open a pull request against `main`

5. **Fill out the PR template** -- describe what changed and why

### PR Guidelines

- Keep PRs focused on a single change
- Include screenshots or recordings for UI changes
- Link related issues using `Closes #123` syntax
- Ensure CI passes before requesting review (macOS + Windows builds must succeed)

---

## Issue Templates

When opening an issue, please use the appropriate template:

- **Bug Report** -- for something that is broken or not working as expected
- **Feature Request** -- for new functionality or enhancements

Templates are available automatically when you create a new issue on GitHub.

---

## License

By contributing to Yapper, you agree that your contributions will be licensed under the [MIT License](LICENSE).
