use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// ── Engine selector ──────────────────────────────────────────────────────────
// 0 = classic (SAPI5 via PowerShell), 1 = modern (WinRT)
static STT_ENGINE: AtomicU8 = AtomicU8::new(0);

pub fn set_engine(modern: bool) {
    STT_ENGINE.store(if modern { 1 } else { 0 }, Ordering::Relaxed);
    println!("[STT] Engine set to: {}", if modern { "modern (WinRT)" } else { "classic (SAPI5)" });
}

pub fn is_modern() -> bool {
    STT_ENGINE.load(Ordering::Relaxed) == 1
}

// ── Public dispatch ──────────────────────────────────────────────────────────

pub async fn start_recognition(app: &tauri::AppHandle) -> Result<(), String> {
    if is_modern() {
        modern::start(app).await
    } else {
        classic::start(app).await
    }
}

pub async fn stop_recognition() -> Result<String, String> {
    if is_modern() {
        modern::stop().await
    } else {
        classic::stop().await
    }
}

pub fn set_transcript(text: &str) {
    let _ = text;
}

// ── Classic engine: SAPI5 via PowerShell subprocess ──────────────────────────

mod classic {
    use super::*;

    static RECOGNIZER_PROCESS: Lazy<Mutex<Option<std::process::Child>>> =
        Lazy::new(|| Mutex::new(None));

    static POWERSHELL_SCRIPT: &str = r#"
Add-Type -AssemblyName System.Speech

$csharp = @'
using System;
using System.Speech.Recognition;
using System.Speech.AudioFormat;
using System.Threading;
using System.IO;
using System.Globalization;
using System.Collections.ObjectModel;

public class YapperDictation {
    static string transcript = "";

    public static string Run(string stopFile) {
        try {
            ReadOnlyCollection<RecognizerInfo> recognizers = SpeechRecognitionEngine.InstalledRecognizers();
            Console.Error.WriteLine("INIT: Found " + recognizers.Count + " recognizer(s)");
            foreach (var r in recognizers) {
                Console.Error.WriteLine("INIT:   - " + r.Name + " [" + r.Culture + "]");
            }

            RecognizerInfo chosen = null;
            foreach (var r in recognizers) {
                if (r.Culture.Name.StartsWith("en")) { chosen = r; break; }
            }
            if (chosen == null && recognizers.Count > 0) chosen = recognizers[0];

            using (var engine = chosen != null
                ? new SpeechRecognitionEngine(chosen)
                : new SpeechRecognitionEngine()) {

                engine.SetInputToDefaultAudioDevice();
                engine.InitialSilenceTimeout = TimeSpan.FromSeconds(30);
                engine.BabbleTimeout = TimeSpan.Zero;
                engine.EndSilenceTimeout = TimeSpan.FromSeconds(1.5);
                engine.EndSilenceTimeoutAmbiguous = TimeSpan.FromSeconds(2.0);

                var grammar = new DictationGrammar();
                grammar.Name = "dictation";
                grammar.Weight = 1.0f;
                engine.LoadGrammar(grammar);

                var spelling = new DictationGrammar("grammar:dictation#spelling");
                spelling.Name = "spelling";
                spelling.Weight = 0.2f;
                engine.LoadGrammar(spelling);

                try { engine.UpdateRecognizerSetting("CFGConfidenceRejectionThreshold", 5); } catch {}
                try {
                    engine.UpdateRecognizerSetting("HighConfidenceThreshold", 30);
                    engine.UpdateRecognizerSetting("NormalConfidenceThreshold", 15);
                    engine.UpdateRecognizerSetting("LowConfidenceThreshold", 5);
                } catch {}

                engine.SpeechRecognized += (s, e) => {
                    if (e.Result != null && e.Result.Text.Length > 0) {
                        Console.Error.WriteLine("RECOGNIZED: '" + e.Result.Text + "' (confidence: " + e.Result.Confidence + ")");
                        transcript += e.Result.Text + " ";
                    }
                };

                engine.SpeechRecognitionRejected += (s, e) => {
                    if (e.Result != null && e.Result.Text.Length > 0) {
                        transcript += e.Result.Text + " ";
                    }
                };

                engine.RecognizeAsync(RecognizeMode.Multiple);

                if (File.Exists(stopFile)) {
                    try { File.Delete(stopFile); } catch {}
                }

                Console.Error.WriteLine("LISTENING");

                while (!File.Exists(stopFile)) {
                    Thread.Sleep(100);
                }

                engine.RecognizeAsyncStop();
                Thread.Sleep(1500);
                Console.Error.WriteLine("RESULT: '" + transcript.Trim() + "'");
                return transcript.Trim();
            }
        } catch (Exception ex) {
            Console.Error.WriteLine("ERROR: " + ex.ToString());
            return "";
        }
    }
}
'@

Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Speech
$result = [YapperDictation]::Run($args[0])
Write-Output $result
"#;

    fn stop_file_path() -> std::path::PathBuf {
        std::env::temp_dir().join("yapper_stop")
    }

    fn script_file_path() -> std::path::PathBuf {
        std::env::temp_dir().join("yapper_stt.ps1")
    }

    pub async fn start(app: &tauri::AppHandle) -> Result<(), String> {
        let _ = app;

        if let Some(mut old) = RECOGNIZER_PROCESS.lock().map_err(|e| e.to_string())?.take() {
            let _ = old.kill();
            let _ = old.wait();
        }

        let stop_file = stop_file_path();
        let script_file = script_file_path();
        let _ = std::fs::remove_file(&stop_file);

        std::fs::write(&script_file, POWERSHELL_SCRIPT)
            .map_err(|e| format!("Failed to write STT script: {}", e))?;

        let mut child = std::process::Command::new("powershell.exe")
            .args([
                "-ExecutionPolicy", "Bypass",
                "-NoProfile", "-NoLogo",
                "-File", &script_file.to_string_lossy(),
                &stop_file.to_string_lossy(),
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Failed to start speech recognition: {}", e))?;

        println!("[STT-Classic] PowerShell subprocess started (pid {})", child.id());

        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                println!("[STT-PS] {}", line);
                let _ = tx.send(line);
            }
        });

        let mut ready = false;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(std::time::Duration::from_millis(200)) {
                Ok(line) => {
                    if line.contains("LISTENING") { ready = true; break; }
                    if line.contains("ERROR:") {
                        let _ = child.kill();
                        return Err(format!("STT init failed: {}", line));
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if let Ok(Some(status)) = child.try_wait() {
                        return Err(format!("STT process exited early with: {}", status));
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("STT process stderr closed unexpectedly".to_string());
                }
            }
        }

        if !ready {
            let _ = child.kill();
            return Err("STT engine timed out during initialization".to_string());
        }

        *RECOGNIZER_PROCESS.lock().map_err(|e| e.to_string())? = Some(child);
        println!("[STT-Classic] Recognition started — listening");
        Ok(())
    }

    pub async fn stop() -> Result<String, String> {
        let stop_file = stop_file_path();
        let script_file = script_file_path();

        println!("[STT-Classic] Stop requested...");

        let mut child_opt = None;
        for _ in 0..200 {
            let taken = RECOGNIZER_PROCESS.lock().map_err(|e| e.to_string())?.take();
            if taken.is_some() { child_opt = taken; break; }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        std::fs::write(&stop_file, "stop")
            .map_err(|e| format!("Failed to signal stop: {}", e))?;

        let Some(mut child) = child_opt else {
            let _ = std::fs::remove_file(&stop_file);
            return Err("No recording in progress".to_string());
        };

        for _ in 0..80 {
            if let Ok(Some(_)) = child.try_wait() { break; }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        let _ = child.kill();
        let output = child.wait_with_output().map_err(|e| e.to_string())?;

        let _ = std::fs::remove_file(&stop_file);
        let _ = std::fs::remove_file(&script_file);

        let transcript = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        println!("[STT-Classic] stdout: '{}', stderr len: {}", transcript, stderr.len());

        if !transcript.is_empty() {
            Ok(transcript)
        } else if stderr.contains("LISTENING") && transcript.is_empty() {
            Err("No speech detected — try speaking louder or check your microphone".to_string())
        } else if stderr.contains("ERROR:") {
            Err(format!("Speech recognition error: {}", stderr))
        } else {
            Err("No speech was recognized".to_string())
        }
    }
}

// ── Modern engine: WinRT SpeechRecognizer ────────────────────────────────────

mod modern {
    use super::*;
    use windows::Foundation::TypedEventHandler;
    use windows::Media::SpeechRecognition::*;

    struct RecognizerState {
        transcript: Arc<Mutex<String>>,
        stop_signal: Arc<std::sync::atomic::AtomicBool>,
        thread: Option<std::thread::JoinHandle<Result<(), String>>>,
    }

    static MODERN_STATE: Lazy<Mutex<Option<RecognizerState>>> =
        Lazy::new(|| Mutex::new(None));

    pub async fn start(app: &tauri::AppHandle) -> Result<(), String> {
        let _ = app;

        // Clean up previous session
        if let Some(old) = MODERN_STATE.lock().map_err(|e| e.to_string())?.take() {
            old.stop_signal.store(true, Ordering::Relaxed);
            if let Some(t) = old.thread { let _ = t.join(); }
        }

        let transcript = Arc::new(Mutex::new(String::new()));
        let stop_signal = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let t_clone = transcript.clone();
        let s_clone = stop_signal.clone();
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let thread = std::thread::spawn(move || -> Result<(), String> {
            // Initialize COM for WinRT
            unsafe {
                let _ = windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                );
            }

            let result = run_winrt_recognizer(t_clone, s_clone, tx.clone());
            if let Err(ref e) = result {
                println!("[STT-Modern] Thread error: {}", e);
                let _ = tx.send(Err(e.clone()));
            }
            result
        });

        // Wait for recognizer to start (up to 15 seconds)
        match rx.recv_timeout(std::time::Duration::from_secs(15)) {
            Ok(Ok(())) => {},
            Ok(Err(e)) => return Err(format!("WinRT speech init failed: {}", e)),
            Err(_) => return Err("WinRT recognizer timed out during initialization".to_string()),
        }

        *MODERN_STATE.lock().map_err(|e| e.to_string())? = Some(RecognizerState {
            transcript,
            stop_signal,
            thread: Some(thread),
        });

        println!("[STT-Modern] Recognition started — listening");
        Ok(())
    }

    fn run_winrt_recognizer(
        transcript: Arc<Mutex<String>>,
        stop_signal: Arc<std::sync::atomic::AtomicBool>,
        ready_tx: std::sync::mpsc::Sender<Result<(), String>>,
    ) -> Result<(), String> {
        let recognizer = SpeechRecognizer::new()
            .map_err(|e| format!("Failed to create WinRT recognizer: {} — ensure 'Online speech recognition' is enabled in Settings > Privacy > Speech", e))?;

        let constraint = SpeechRecognitionTopicConstraint::Create(
            SpeechRecognitionScenario::Dictation,
            &windows::core::HSTRING::from("dictation"),
        ).map_err(|e| format!("Failed to create dictation constraint: {}", e))?;

        recognizer.Constraints()
            .map_err(|e| e.to_string())?
            .Append(&constraint)
            .map_err(|e| e.to_string())?;

        let compile_result = recognizer.CompileConstraintsAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| format!("CompileConstraints failed: {} — ensure 'Online speech recognition' is enabled in Settings > Privacy > Speech", e))?;

        if compile_result.Status().map_err(|e| e.to_string())? != SpeechRecognitionResultStatus::Success {
            return Err("Failed to compile speech constraints — check Windows speech recognition settings".to_string());
        }

        let session = recognizer.ContinuousRecognitionSession()
            .map_err(|e| e.to_string())?;

        // Register result handler
        let tc = transcript.clone();
        session.ResultGenerated(&TypedEventHandler::new(move |_, args: &Option<SpeechContinuousRecognitionResultGeneratedEventArgs>| {
            if let Some(args) = args {
                if let Ok(result) = args.Result() {
                    if let Ok(text) = result.Text() {
                        let text_str = text.to_string();
                        if !text_str.is_empty() {
                            println!("[STT-Modern] RECOGNIZED: '{}'", text_str);
                            let mut t = tc.lock().unwrap();
                            t.push_str(&text_str);
                            t.push(' ');
                        }
                    }
                }
            }
            Ok(())
        })).map_err(|e| e.to_string())?;

        // Start continuous recognition
        session.StartAsync()
            .map_err(|e| format!("StartAsync failed: {} — ensure 'Online speech recognition' is enabled in Settings > Privacy > Speech", e))?
            .get()
            .map_err(|e| format!("StartAsync.get failed: {} — ensure 'Online speech recognition' is enabled in Settings > Privacy > Speech", e))?;

        println!("[STT-Modern] LISTENING");
        let _ = ready_tx.send(Ok(()));

        // Wait for stop signal
        while !stop_signal.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        // Stop recognition
        let _ = session.StopAsync()
            .map_err(|e| e.to_string())?
            .get();
        std::thread::sleep(std::time::Duration::from_millis(500));

        Ok(())
    }

    pub async fn stop() -> Result<String, String> {
        println!("[STT-Modern] Stop requested...");

        // Wait for state to be available (handles race with start)
        let mut state_opt = None;
        for _ in 0..200 {
            let taken = MODERN_STATE.lock().map_err(|e| e.to_string())?.take();
            if taken.is_some() { state_opt = taken; break; }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        let Some(state) = state_opt else {
            return Err("No recording in progress".to_string());
        };

        // Signal the thread to stop
        state.stop_signal.store(true, Ordering::Relaxed);

        // Wait for thread to finish
        if let Some(thread) = state.thread {
            let _ = thread.join();
        }

        let transcript = state.transcript.lock()
            .map_err(|e| e.to_string())?
            .trim()
            .to_string();

        println!("[STT-Modern] Result: '{}'", transcript);

        if !transcript.is_empty() {
            Ok(transcript)
        } else {
            Err("No speech detected — try speaking louder or check your microphone".to_string())
        }
    }
}
