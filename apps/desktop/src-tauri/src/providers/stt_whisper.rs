use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::model_manager;
use crate::providers::{PartialTranscript, SttProvider};

const WHISPER_SAMPLE_RATE: u32 = 16000;
const STREAM_INTERVAL_SECS: f32 = 2.0;

/// Wrapper around cpal::Stream so it can be stored in a Send+Sync struct.
/// cpal::Stream is not Send/Sync on all platforms (macOS), but we only access it
/// through a Mutex and only from start/stop/cleanup — never sent across threads.
struct SendStream(cpal::Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

pub struct WhisperCppProvider {
    model_path: String,
    language: String,
    streaming: bool,
    audio_buffer: Arc<Mutex<Vec<f32>>>,
    stop_signal: Arc<AtomicBool>,
    partial_tx: Mutex<Option<Sender<PartialTranscript>>>,
    partial_rx: Mutex<Option<Receiver<PartialTranscript>>>,
    stream_handle: Mutex<Option<SendStream>>,
    final_transcript: Arc<Mutex<Option<String>>>,
    stream_thread: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl WhisperCppProvider {
    pub fn new(model_name: &str, language: &str, streaming: bool) -> Result<Self, String> {
        let path = model_manager::model_path(model_name);
        if !path.exists() {
            return Err(format!(
                "Whisper model '{}' not found. Download it in Settings.",
                model_name
            ));
        }

        let (tx, rx) = mpsc::channel();

        Ok(Self {
            model_path: path.to_string_lossy().to_string(),
            language: language.to_string(),
            streaming,
            audio_buffer: Arc::new(Mutex::new(Vec::new())),
            stop_signal: Arc::new(AtomicBool::new(false)),
            partial_tx: Mutex::new(Some(tx)),
            partial_rx: Mutex::new(Some(rx)),
            stream_handle: Mutex::new(None),
            final_transcript: Arc::new(Mutex::new(None)),
            stream_thread: Mutex::new(None),
        })
    }

    fn transcribe(model_path: &str, samples: &[f32], language: &str) -> Result<String, String> {
        let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
            .map_err(|e| format!("Failed to load whisper model: {}", e))?;

        let mut state = ctx
            .create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_suppress_non_speech_tokens(true);

        if language != "auto" {
            params.set_language(Some(language));
        }

        state
            .full(params, samples)
            .map_err(|e| format!("Whisper inference failed: {}", e))?;

        let num_segments = state
            .full_n_segments()
            .map_err(|e| format!("Failed to get segments: {}", e))?;

        let mut transcript = String::new();
        for i in 0..num_segments {
            if let Ok(text) = state.full_get_segment_text(i) {
                transcript.push_str(text.trim());
                transcript.push(' ');
            }
        }

        Ok(transcript.trim().to_string())
    }
}

impl SttProvider for WhisperCppProvider {
    fn start(&self, app: &tauri::AppHandle) -> Result<(), String> {
        self.stop_signal.store(false, Ordering::Relaxed);
        self.audio_buffer.lock().unwrap().clear();
        *self.final_transcript.lock().unwrap() = None;

        // Start cpal audio capture
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No audio input device found")?;

        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(WHISPER_SAMPLE_RATE),
            buffer_size: cpal::BufferSize::Default,
        };

        let buffer = self.audio_buffer.clone();
        let err_fn = |err: cpal::StreamError| {
            log::error!("Audio capture error: {}", err);
        };

        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    buffer.lock().unwrap().extend_from_slice(data);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build audio stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {}", e))?;

        *self.stream_handle.lock().unwrap() = Some(SendStream(stream));

        // Start streaming inference thread if enabled
        if self.streaming {
            let stop = self.stop_signal.clone();
            let audio_buf = self.audio_buffer.clone();
            let model_path = self.model_path.clone();
            let language = self.language.clone();
            let tx = self.partial_tx.lock().unwrap().clone();
            let app_handle = app.clone();

            let handle = std::thread::spawn(move || {
                use tauri::Emitter;
                let interval = std::time::Duration::from_secs_f32(STREAM_INTERVAL_SECS);
                let mut last_len: usize = 0;

                while !stop.load(Ordering::Relaxed) {
                    std::thread::sleep(interval);
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }

                    let samples: Vec<f32> = audio_buf.lock().unwrap().clone();
                    if samples.len() <= last_len + (WHISPER_SAMPLE_RATE as usize / 2) {
                        continue;
                    }
                    last_len = samples.len();

                    match Self::transcribe(&model_path, &samples, &language) {
                        Ok(text) if !text.is_empty() => {
                            let partial = PartialTranscript {
                                text: text.clone(),
                                is_final: false,
                            };
                            if let Some(ref tx) = tx {
                                let _ = tx.send(partial.clone());
                            }
                            let _ = app_handle.emit("stt-partial", &partial);
                        }
                        Err(e) => {
                            log::warn!("Streaming transcription error: {}", e);
                        }
                        _ => {}
                    }
                }
            });

            *self.stream_thread.lock().unwrap() = Some(handle);
        }

        Ok(())
    }

    fn stop(&self) -> Result<String, String> {
        self.stop_signal.store(true, Ordering::Relaxed);

        if let Some(stream) = self.stream_handle.lock().unwrap().take() {
            drop(stream);
        }

        if let Some(handle) = self.stream_thread.lock().unwrap().take() {
            let _ = handle.join();
        }

        let samples: Vec<f32> = self.audio_buffer.lock().unwrap().clone();

        if samples.len() < (WHISPER_SAMPLE_RATE as usize / 2) {
            return Err("No speech detected — recording too short".to_string());
        }

        let transcript = Self::transcribe(&self.model_path, &samples, &self.language)?;

        if transcript.is_empty() {
            return Err("No speech detected".to_string());
        }

        if let Some(ref tx) = *self.partial_tx.lock().unwrap() {
            let _ = tx.send(PartialTranscript {
                text: transcript.clone(),
                is_final: true,
            });
        }

        *self.final_transcript.lock().unwrap() = Some(transcript.clone());
        Ok(transcript)
    }

    fn stream_receiver(&self) -> Option<Receiver<PartialTranscript>> {
        self.partial_rx.lock().unwrap().take()
    }

    fn supports_streaming(&self) -> bool {
        self.streaming
    }

    fn cleanup(&self) {
        self.stop_signal.store(true, Ordering::Relaxed);
        if let Some(stream) = self.stream_handle.lock().unwrap().take() {
            drop(stream);
        }
    }
}
