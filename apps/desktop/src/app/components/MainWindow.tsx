import { Settings, Moon, Sun } from "lucide-react";
import { HistoryCard } from "./HistoryCard";
import { SettingsDialog } from "./SettingsDialog";
import { motion } from "motion/react";
import { useState } from "react";
import type { AppSettings } from "../lib/types";

interface MainWindowProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  historyItems: Array<{
    id: string;
    timestamp: string;
    refinedText: string;
    rawTranscript: string;
  }>;
  settings?: AppSettings;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
}

export function MainWindow({ isDarkMode, onToggleDarkMode, historyItems, settings, onUpdateSettings }: MainWindowProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <div
        className="w-full h-screen flex flex-col"
        style={{ background: "var(--background)" }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between shrink-0"
          data-tauri-drag-region
          style={{
            background: "var(--claude-bg-lighter)",
            height: 52,
            paddingLeft: 78,
            paddingRight: 16,
            borderBottom: "1px solid var(--claude-border)",
          }}
        >
          <h1
            className="select-none pointer-events-none"
            data-tauri-drag-region
            style={{
              color: "var(--claude-text-primary)",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              fontSize: 14,
            }}
          >
            Prompt Refinement Services
          </h1>

          <div className="flex items-center" style={{ gap: 8 }}>
            {/* Shortcut badge */}
            <div
              className="select-none pointer-events-none flex items-center"
              data-tauri-drag-region
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background: "var(--claude-bg-light)",
                border: "1px solid var(--claude-border)",
                gap: 3,
              }}
            >
              <span style={{
                fontSize: 11,
                color: "var(--claude-text-secondary)",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                fontWeight: 500,
                letterSpacing: "0.04em",
              }}>
                ⌘⇧.
              </span>
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={onToggleDarkMode}
              className="flex items-center justify-center transition-all duration-200"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--claude-bg-light)",
                border: "1px solid var(--claude-border)",
                cursor: "pointer",
                outline: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDarkMode ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {isDarkMode ? (
                  <Moon style={{ width: 16, height: 16, color: "var(--claude-orange)" }} />
                ) : (
                  <Sun style={{ width: 16, height: 16, color: "var(--claude-orange)" }} />
                )}
              </motion.div>
            </button>

            {/* Settings */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center transition-all duration-200"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--claude-bg-light)",
                border: "1px solid var(--claude-border)",
                cursor: "pointer",
                outline: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Settings style={{ width: 16, height: 16, color: "var(--claude-text-secondary)" }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <h2
            className="mb-4"
            style={{
              color: "var(--claude-text-secondary)",
              fontSize: 12,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            History
          </h2>

          {historyItems.length === 0 ? (
            <div
              className="text-center py-12 rounded-xl"
              style={{
                background: "var(--claude-bg-lighter)",
                border: "1px dashed var(--claude-border)",
              }}
            >
              <p style={{ color: "var(--claude-text-secondary)", fontSize: 13 }}>
                No recordings yet. Press the widget or ⌘⇧. to start.
              </p>
            </div>
          ) : (
            historyItems.map((item) => (
              <HistoryCard
                key={item.id}
                timestamp={item.timestamp}
                refinedText={item.refinedText}
                rawTranscript={item.rawTranscript}
              />
            ))
          )}
        </div>
      </div>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
      />
    </>
  );
}
