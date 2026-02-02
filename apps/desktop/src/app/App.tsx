import { useEffect, useState, useRef } from "react";
import { MainWindow } from "./components/MainWindow";
import { LandingPage } from "./components/LandingPage";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";

// Web Speech API type declarations
declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
  }
  interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
  }
  interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }
}

export default function App() {
  const { settings, updateSettings } = useSettings();
  const { widgetState, latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem, clearAll, togglePin } = useHistory();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(() => {
    return localStorage.getItem("yapper-onboarded") === "true";
  });
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Web Speech API — handles mic capture + speech-to-text
  useEffect(() => {
    let finalTranscript = "";
    let isRecognizing = false;

    const unlistenStart = listen("start-speech-recognition", () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error("Speech recognition not supported in this WebView");
        invoke("set_transcript", { text: "[Speech recognition not supported — WebView does not support Web Speech API]" });
        return;
      }

      finalTranscript = "";
      isRecognizing = true;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + " ";
          } else {
            interim += result[0].transcript;
          }
        }
        console.log("[STT] interim:", interim, "final:", finalTranscript);
      };

      recognition.onerror = (event) => {
        console.error("[STT] error:", event.error);
        // "not-allowed" = mic permission denied
        // "no-speech" = silence detected
        // "aborted" = we called stop()
        if (event.error === "not-allowed") {
          invoke("set_transcript", { text: "[Microphone access denied — grant permission in System Settings]" });
        }
      };

      recognition.onend = () => {
        console.log("[STT] ended, isRecognizing:", isRecognizing, "transcript:", finalTranscript);
        if (isRecognizing) {
          // Browser auto-stopped (e.g., silence) — restart to keep listening
          try {
            recognition.start();
            console.log("[STT] restarted after auto-stop");
          } catch (e) {
            console.error("[STT] failed to restart:", e);
            // Send what we have
            if (finalTranscript.trim()) {
              invoke("set_transcript", { text: finalTranscript.trim() });
            }
          }
        } else {
          // User stopped — send the transcript
          if (finalTranscript.trim()) {
            invoke("set_transcript", { text: finalTranscript.trim() });
          }
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        console.log("[STT] started");
      } catch (e) {
        console.error("[STT] failed to start:", e);
        invoke("set_transcript", { text: "[Failed to start speech recognition]" });
      }
    });

    const unlistenStop = listen("stop-speech-recognition", () => {
      console.log("[STT] stop requested");
      isRecognizing = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    });

    return () => {
      unlistenStart.then((fn) => fn());
      unlistenStop.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (latestResult) {
      addItem(latestResult);
    }
  }, [latestResult, addItem]);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }
  }, []);

  const handleToggleDarkMode = () => {
    const nowDark = !isDarkMode;
    setIsDarkMode(nowDark);
    if (nowDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    emit("theme-changed", nowDark ? "dark" : "light");
  };

  const handleGetStarted = () => {
    localStorage.setItem("yapper-onboarded", "true");
    setHasOnboarded(true);
  };

  return (
    <div
      className="h-screen overflow-hidden"
      style={{
        fontFamily: "var(--font-body, 'Inter', sans-serif)",
        background: "var(--background)",
      }}
    >
      <AnimatePresence mode="wait">
        {!hasOnboarded ? (
          <motion.div
            key="landing"
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
          >
            <LandingPage onGetStarted={handleGetStarted} />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="h-screen"
          >
            <MainWindow
              isDarkMode={isDarkMode}
              onToggleDarkMode={handleToggleDarkMode}
              historyItems={historyItems}
              settings={settings}
              onUpdateSettings={updateSettings}
              onClearHistory={clearAll}
              onTogglePin={togglePin}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div
          className="fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-lg"
          style={{
            background: "var(--destructive)",
            color: "var(--destructive-foreground)",
          }}
        >
          <p className="text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-xs underline mt-1">
            Dismiss
          </button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--yapper-border); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--yapper-accent); }
      `}</style>
    </div>
  );
}
