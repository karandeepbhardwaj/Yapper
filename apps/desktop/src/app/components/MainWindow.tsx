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
        className="w-full max-w-2xl mx-auto rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--background)",
          border: "1px solid var(--claude-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          data-tauri-drag-region
          style={{
            borderColor: "var(--claude-border)",
            background: "var(--claude-bg-lighter)",
          }}
        >
          <h1
            className="text-lg"
            style={{
              color: "var(--claude-text-primary)",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            Prompt Refinement Services
          </h1>

          <div className="flex items-center gap-3">
            <button
              onClick={onToggleDarkMode}
              className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
              style={{
                background: "var(--claude-bg-light)",
                border: "1px solid var(--claude-border)",
              }}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDarkMode ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                {isDarkMode ? (
                  <Moon className="w-5 h-5" style={{ color: "var(--claude-orange)" }} />
                ) : (
                  <Sun className="w-5 h-5" style={{ color: "var(--claude-orange)" }} />
                )}
              </motion.div>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
              style={{
                background: "var(--claude-bg-light)",
                border: "1px solid var(--claude-border)",
              }}
            >
              <Settings className="w-5 h-5" style={{ color: "var(--claude-text-secondary)" }} />
            </button>
          </div>
        </div>

        {/* Main Content - History Feed */}
        <div className="p-6">
          <h2 className="text-sm mb-4" style={{ color: "var(--claude-text-secondary)" }}>
            History
          </h2>

          <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {historyItems.length === 0 ? (
              <div
                className="text-center py-12 rounded-xl"
                style={{
                  background: "var(--claude-bg-lighter)",
                  border: "1px dashed var(--claude-border)",
                }}
              >
                <p style={{ color: "var(--claude-text-secondary)" }}>
                  No recordings yet. Press the floating widget or use Alt+Space to start.
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
