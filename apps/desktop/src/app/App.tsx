import { useEffect, useState, useRef } from "react";
import { MainWindow } from "./components/MainWindow";
import { LandingPage } from "./components/LandingPage";
import { ConversationView } from "./components/ConversationView";
import { SettingsView } from "./components/SettingsView";
import { DictionaryView } from "./components/DictionaryView";
import { SnippetsView } from "./components/SnippetsView";
import { HelpView } from "./components/HelpView";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "./lib/types";
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
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const themeOriginRef = useRef<{ x: number; y: number }>({ x: window.innerWidth / 2, y: 40 });
  const isDarkMode = theme === "dark" || (theme === "system" && systemDark);
  const [activeView, setActiveView] = useState<"history" | "conversation" | "settings" | "dictionary" | "snippets" | "help">("history");
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

  // Refresh history after conversation ends (conversations don't emit refinement-complete)
  useEffect(() => {
    const unlisten = listen<string>("conversation-saved", () => {
      refresh();
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

  // Load theme from settings on mount
  useEffect(() => {
    invoke<AppSettings>("get_settings").then((s) => {
      if (s?.theme) setTheme(s.theme as "light" | "dark" | "system");
    }).catch(console.error);
  }, []);

  // Apply dark class with circle-reveal animation
  const prevDarkRef = useRef(isDarkMode);
  const transitioningRef = useRef(false);

  useEffect(() => {
    const wasDark = prevDarkRef.current;
    prevDarkRef.current = isDarkMode;

    if (wasDark === isDarkMode) return;

    emit("theme-changed", isDarkMode ? "dark" : "light");

    // Circle reveal from the button that was clicked
    const x = themeOriginRef.current.x;
    const y = themeOriginRef.current.y;
    const maxRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ));

    if (document.startViewTransition && !transitioningRef.current) {
      transitioningRef.current = true;

      document.startViewTransition(() => {
        if (isDarkMode) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      });

      const style = document.createElement("style");
      if (isDarkMode) {
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
        transitioningRef.current = false;
      }, 700);
    } else {
      // Fallback: instant
      if (isDarkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [isDarkMode]);

  // Track system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Listen for theme changes from Settings page
  useEffect(() => {
    const unsub = listen<{ theme: string; x: number; y: number }>("theme-setting-changed", (e) => {
      themeOriginRef.current = { x: e.payload.x, y: e.payload.y };
      setTheme(e.payload.theme as "light" | "dark" | "system");
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

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
        ) : activeView === "help" ? (
          <motion.div
            key="help"
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            className="h-screen"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            <HelpView onBack={() => setActiveView("history")} hotkey={hotkey} conversationHotkey={conversationHotkey} />
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
              historyItems={historyItems}
              onClearHistory={clearAll}
              onDeleteItem={deleteItem}
              onTogglePin={togglePin}
              onOpenSettings={() => setActiveView("settings")}
              onOpenHelp={() => setActiveView("help")}
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
        .yapper-scroll { -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch; will-change: scroll-position; transform: translateZ(0); }
        @keyframes blink { 0%, 100% { opacity: 0.6; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
