import { useEffect, useState } from "react";
import { MainWindow } from "./components/MainWindow";
import { LandingPage } from "./components/LandingPage";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { emit } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const { settings, updateSettings } = useSettings();
  const { widgetState, latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem } = useHistory();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(() => {
    return localStorage.getItem("yapper-onboarded") === "true";
  });

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
