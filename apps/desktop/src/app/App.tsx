import { useEffect, useState, useRef } from "react";
import { MainWindow } from "./components/MainWindow";
import { LandingPage } from "./components/LandingPage";
import { ConversationView } from "./components/ConversationView";
import { SettingsView } from "./components/SettingsView";
import { DictionaryView } from "./components/DictionaryView";
import { SnippetsView } from "./components/SnippetsView";
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
  const { hotkey, setHotkey, sttEngine, setSttEngine, conversationHotkey } = useSettings();
  const { latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem, refresh, clearAll, deleteItem, togglePin } = useHistory();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeView, setActiveView] = useState<"history" | "conversation" | "settings" | "dictionary" | "snippets">("history");
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

  // Refresh history after any recording cycle completes
  useEffect(() => {
    const unlisten = listen<string>("stt-state-changed", (e) => {
      if (e.payload === "idle") {
        setTimeout(() => refresh(), 300);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refresh]);

  // Listen for navigate-to events from widget context menu
  useEffect(() => {
    const unlisten = listen<string>("navigate-to", (e) => {
      const view = e.payload as "settings" | "history" | "conversation";
      if (view === "history") {
        setActiveView("history");
      } else if (view === "settings") {
        setActiveView("settings");
      } else if (view === "conversation") {
        setActiveView("conversation");
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    }
  }, []);

  const themeTransitionRef = useRef(false);

  const handleToggleDarkMode = (e?: React.MouseEvent) => {
    if (themeTransitionRef.current) return;
    themeTransitionRef.current = true;

    const nowDark = !isDarkMode;
    // Get the center of the button that was clicked, not the mouse position
    const button = e?.currentTarget as HTMLElement | null;
    const rect = button?.getBoundingClientRect();
    const x = rect ? Math.round(rect.left + rect.width / 2) : window.innerWidth - 40;
    const y = rect ? Math.round(rect.top + rect.height / 2) : 20;
    const maxRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ));

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

      const style = document.createElement("style");
      if (nowDark) {
        // Light→Dark: old light shrinks into toggle
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
        // Dark→Light: new light expands from toggle
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

    // Fallback: instant toggle
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
        position: "relative",
      }}
    >
      <AnimatePresence mode="popLayout">
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
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            className="h-screen"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            <ConversationView
              onBack={() => { setActiveView("history"); refresh(); }}
              onConversationEnded={() => { setActiveView("history"); refresh(); }}
              hotkey={hotkey}
            />
          </motion.div>
        ) : activeView === "settings" ? (
          <motion.div
            key="settings"
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            className="h-screen"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            <SettingsView
              onBack={() => setActiveView("history")}
              onNavigateDictionary={() => setActiveView("dictionary")}
              onNavigateSnippets={() => setActiveView("snippets")}
            />
          </motion.div>
        ) : activeView === "dictionary" ? (
          <motion.div
            key="dictionary"
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            className="h-screen"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            <DictionaryView onBack={() => setActiveView("settings")} />
          </motion.div>
        ) : activeView === "snippets" ? (
          <motion.div
            key="snippets"
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            className="h-screen"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            <SnippetsView onBack={() => setActiveView("settings")} />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ x: "-30%", scale: 0.95, opacity: 0.5 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            className="h-screen"
          >
            <MainWindow
              isDarkMode={isDarkMode}
              onToggleDarkMode={handleToggleDarkMode}
              historyItems={historyItems}
              onClearHistory={clearAll}
              onDeleteItem={deleteItem}
              onTogglePin={togglePin}
              onOpenSettings={() => setActiveView("settings")}
              hotkey={hotkey}
              conversationHotkey={conversationHotkey}
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
