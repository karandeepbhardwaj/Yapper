use enigo::{Enigo, Settings};

pub fn paste_text(text: &str) -> Result<(), String> {
    set_clipboard(text)?;

    // Small delay to ensure clipboard is set
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Simulate paste shortcut
    #[cfg(target_os = "macos")]
    {
        use enigo::{Keyboard, Key, Direction};
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        use enigo::{Keyboard, Key, Direction};
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        enigo.key(Key::Control, Direction::Press).map_err(|e| e.to_string())?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        enigo.key(Key::Control, Direction::Release).map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = Enigo::new(&Settings::default());
        log::warn!("Auto-paste not supported on this platform");
    }

    Ok(())
}

fn set_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let mut child = Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
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
