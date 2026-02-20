import { useEffect, useState, useRef } from "react";
import { MainWindow } from "./components/MainWindow";
import { LandingPage } from "./components/LandingPage";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";

// Web Speech API — webkitSpeechRecognition for Tauri WebView
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string; confidence: number };
    };
  };
  resultIndex: number;
};

export default function App() {
  const { hotkey, setHotkey } = useSettings();
  const { latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem, clearAll, deleteItem, togglePin } = useHistory();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(() => {
    return localStorage.getItem("yapper-onboarded") === "true";
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Web Speech API — handles mic capture + speech-to-text
  useEffect(() => {
    let finalTranscript = "";
    let isRecognizing = false;

    const unlistenStart = listen("start-speech-recognition", () => {
      const SpeechRecognitionCtor = window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        console.error("Speech recognition not supported in this WebView");
        invoke("set_transcript", { text: "[Speech recognition not supported — WebView does not support Web Speech API]" });
        return;
      }

      finalTranscript = "";
      isRecognizing = true;

      const recognition = new SpeechRecognitionCtor() as SpeechRecognitionLike;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
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
              hotkey={hotkey}
              onHotkeyChange={setHotkey}
              onClearHistory={clearAll}
              onDeleteItem={deleteItem}
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
        .yapper-scroll::-webkit-scrollbar { display: none; }
        .yapper-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes blink { 0%, 100% { opacity: 0.6; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
