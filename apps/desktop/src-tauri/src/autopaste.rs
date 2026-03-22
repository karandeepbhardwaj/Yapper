use std::process::Command;

pub fn paste_text(text: &str) -> Result<(), String> {
    set_clipboard(text)?;
    std::thread::sleep(std::time::Duration::from_millis(50));

    #[cfg(target_os = "windows")]
    {
        // Use PowerShell to send Ctrl+V keystroke
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
    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("cmd")
            .args(["/C", &format!("echo {} | clip", text)])
            .spawn()
            .map_err(|e| e.to_string())?;
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = text;
        Err("Clipboard not supported on this platform".to_string())
    }
}
