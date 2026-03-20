import { useEffect, useState } from "react";
import { MainWindow } from "./components/MainWindow";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { emit } from "@tauri-apps/api/event";

export default function App() {
  const { settings, updateSettings } = useSettings();
  const { widgetState, latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem } = useHistory();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Add new history item when refinement completes
  useEffect(() => {
    if (latestResult) {
      addItem(latestResult);
    }
  }, [latestResult, addItem]);

  // Dark mode — check system preference on mount
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

  return (
    <div
      className="h-screen overflow-hidden"
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "var(--background)",
      }}
    >
      <MainWindow
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        historyItems={historyItems}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      {error && (
        <div
          className="fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg"
          style={{
            background: "var(--destructive)",
            color: "var(--destructive-foreground)",
          }}
        >
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: var(--claude-bg-light);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--claude-border);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--claude-orange);
        }
      `}</style>
    </div>
  );
}
