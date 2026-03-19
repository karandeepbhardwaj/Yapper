# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in Yapper, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainer directly or use [GitHub's private vulnerability reporting](https://github.com/karandeepbhardwaj/Yapper/security/advisories/new)
3. Include steps to reproduce and potential impact

You should receive a response within 48 hours. We will work with you to understand and address the issue before any public disclosure.

## Security Model

### Network Isolation
The Yapper desktop app makes **zero external network requests**. All speech recognition runs on-device via macOS `SFSpeechRecognizer` or Windows SAPI5 (Classic engine). The Modern Windows engine uses `Windows.Media.SpeechRecognition` which may send audio to Microsoft for processing (requires user opt-in via "Online speech recognition" privacy setting). The only other network communication is a localhost WebSocket connection to the VS Code extension bridge (`127.0.0.1:9147`).

### Data Handling
- Audio recordings are temporary files in `/tmp/` (macOS) or `%TEMP%` (Windows) and are overwritten each recording
- History is stored as a JSON file in the app data directory (`history.json`, max 100 entries)
- Settings (hotkey, STT engine) are stored in `settings.json` in the app config directory
- No telemetry, analytics, or crash reporting is sent anywhere
- No API keys or credentials are stored by the app

### WebSocket Bridge
- Binds to `127.0.0.1` only (not `0.0.0.0`) — inaccessible from other machines
- No authentication (relies on localhost trust boundary)
- If the bridge is compromised, the blast radius is limited to text refinement results

### Permissions

**macOS:**
- **Microphone**: For audio recording (user-prompted)
- **Speech Recognition**: For on-device STT (user-prompted)
- **Accessibility**: For auto-paste via keystroke simulation (manually granted in System Settings)

**Windows:**
- **Microphone**: For audio recording (Settings > Privacy > Microphone)
- **Online speech recognition** (Modern engine only): Settings > Privacy & security > Speech (the app detects this via registry and shows a setup tooltip)

### Dependencies
- Rust dependencies are locked via `Cargo.lock`
- Node dependencies are locked via `bun.lock`
- No runtime downloads or dynamic code loading
