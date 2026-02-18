import { useEffect } from "react";
import { FloatingWidget } from "./components/FloatingWidget";
import { MainWindow } from "./components/MainWindow";
import { useTauriEvents } from "./hooks/useTauriEvents";
import { useHistory } from "./hooks/useHistory";
import { useSettings } from "./hooks/useSettings";
import { startRecording, stopRecording } from "./lib/tauri-bridge";

export default function App() {
  const { settings, updateSettings } = useSettings();
  const { widgetState, latestResult, error, setError } = useTauriEvents();
  const { historyItems, addItem } = useHistory();

  // Add new history item when refinement completes
  useEffect(() => {
    if (latestResult) {
      addItem(latestResult);
    }
  }, [latestResult, addItem]);

  // Dark mode
  useEffect(() => {
    // Check system preference on mount
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const isDarkMode = document.documentElement.classList.contains("dark");

  const handleToggleDarkMode = () => {
    document.documentElement.classList.toggle("dark");
  };

  const handleWidgetStateChange = async (newState: string) => {
    if (newState === "listening") {
      await startRecording();
    } else if (newState === "idle" && widgetState === "listening") {
      await stopRecording();
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8 transition-colors duration-300"
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

      {settings.showFloatingWidget && (
        <FloatingWidget state={widgetState} onStateChange={handleWidgetStateChange} />
      )}

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
