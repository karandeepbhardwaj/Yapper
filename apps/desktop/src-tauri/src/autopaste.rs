use std::process::{Command, Stdio};

pub fn paste_text(text: &str) -> Result<(), String> {
    set_clipboard(text)?;
    std::thread::sleep(std::time::Duration::from_millis(100));

    #[cfg(target_os = "macos")]
    {
        Command::new("osascript")
            .args(["-e", r#"
                tell application "System Events"
                    set frontApp to name of first application process whose frontmost is true
                    tell application process frontApp
                        keystroke "v" using command down
                    end tell
                end tell
            "#])
            .output()
            .map_err(|e| format!("osascript paste failed: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait("^v")
        "#;
        Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .output()
            .map_err(|e| format!("PowerShell paste failed: {}", e))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        log::warn!("Auto-paste not supported on this platform");
    }

    Ok(())
}

fn set_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("pbcopy failed: {}", e))?;
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            let _ = stdin.write_all(text.as_bytes());
        }
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"])
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("PowerShell clipboard failed: {}", e))?;
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            let _ = stdin.write_all(text.as_bytes());
        }
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = text;
        Err("Clipboard not supported on this platform".to_string())
    }
}
