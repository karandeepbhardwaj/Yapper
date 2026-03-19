import { useEffect, useState, useRef } from "react";
import { MainWindow } from "./components/MainWindow";
import { LandingPage } from "./components/LandingPage";
import { ConversationView } from "./components/ConversationView";
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
  interface Document {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startViewTransition?: (callback: () => void) => any;
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
  const { hotkey, setHotkey, sttEngine, setSttEngine } = useSettings();
  const { latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem, refresh, clearAll, deleteItem, togglePin } = useHistory();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeView, setActiveView] = useState<"history" | "conversation">("history");
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

  const themeTransitionRef = useRef(false);

  const handleToggleDarkMode = async (e?: React.MouseEvent) => {
    if (themeTransitionRef.current) return;
    themeTransitionRef.current = true;

    const nowDark = !isDarkMode;
    const x = e?.clientX ?? window.innerWidth - 40;
    const y = e?.clientY ?? 20;

    const maxRadius = Math.ceil(
      Math.sqrt(
        Math.max(x, window.innerWidth - x) ** 2 +
        Math.max(y, window.innerHeight - y) ** 2
      )
    );

    // Use View Transition API if available (Chromium-based WebViews)
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        if (nowDark) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
        setIsDarkMode(nowDark);
        emit("theme-changed", nowDark ? "dark" : "light");
      });

      // Light→Dark: dark circle expands FROM toggle (darkness spreads out)
      // Dark→Light: dark circle shrinks TO toggle (darkness recedes back)
      const style = document.createElement("style");
      if (nowDark) {
        style.textContent = `
          ::view-transition-old(root) {
            z-index: 9999;
            animation: lightRecede 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          }
          ::view-transition-new(root) { z-index: 999; animation: none; }
          @keyframes lightRecede {
            from { clip-path: circle(${maxRadius}px at ${x}px ${y}px); }
            to { clip-path: circle(0px at ${x}px ${y}px); }
          }
        `;
      } else {
        style.textContent = `
          ::view-transition-old(root) { z-index: 999; animation: none; }
          ::view-transition-new(root) {
            z-index: 9999;
            animation: lightExpand 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          }
          @keyframes lightExpand {
            from { clip-path: circle(0px at ${x}px ${y}px); }
            to { clip-path: circle(${maxRadius}px at ${x}px ${y}px); }
          }
        `;
      }
      document.head.appendChild(style);
      setTimeout(() => {
        style.remove();
        themeTransitionRef.current = false;
      }, 700);
      return;
    }

    // Fallback: simple toggle with no overlay
    setIsDarkMode(nowDark);
    if (nowDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    emit("theme-changed", nowDark ? "dark" : "light");
    themeTransitionRef.current = false;
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
        ) : activeView === "conversation" ? (
          <motion.div
            key="conversation"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className="h-screen"
          >
            <ConversationView
              onBack={() => { setActiveView("history"); refresh(); }}
              onConversationEnded={() => { setActiveView("history"); refresh(); }}
              isDarkMode={isDarkMode}
              onToggleDarkMode={handleToggleDarkMode}
              hotkey={hotkey}
            />
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
              sttEngine={sttEngine}
              onSttEngineChange={setSttEngine}
              onClearHistory={clearAll}
              onDeleteItem={deleteItem}
              onTogglePin={togglePin}
              onStartConversation={() => setActiveView("conversation")}
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
