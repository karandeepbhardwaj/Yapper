import { Settings, Moon, Sun } from "lucide-react";
import { HistoryCard } from "./HistoryCard";
import { SettingsDialog } from "./SettingsDialog";
import { motion } from "motion/react";
import { useState } from "react";
import type { AppSettings, HistoryItem } from "../lib/types";

interface MainWindowProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  historyItems: HistoryItem[];
  settings?: AppSettings;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
}

export function MainWindow({ isDarkMode, onToggleDarkMode, historyItems, settings, onUpdateSettings }: MainWindowProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Determine card variants based on position
  const getVariant = (index: number, item: HistoryItem): "featured" | "compact" | "pinned" => {
    if (item.isPinned) return "pinned";
    if (index === 0) return "featured";
    return "compact";
  };

  // Determine grid span
  const getGridSpan = (index: number, item: HistoryItem): string => {
    if (item.isPinned || index === 0) return "1 / -1"; // full width
    return "span 1";
  };

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
            background: "var(--yapper-bg-lighter)",
            height: 38,
            paddingLeft: 78,
            paddingRight: 12,
          }}
        >
          <h1
            className="select-none pointer-events-none"
            data-tauri-drag-region
            style={{
              fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              fontSize: 15,
              color: "var(--yapper-text-primary)",
            }}
          >
            Yapper
          </h1>

          <div className="flex items-center" style={{ gap: 6 }}>
            <span
              className="select-none pointer-events-none"
              data-tauri-drag-region
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 6,
                color: "var(--yapper-text-secondary)",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                opacity: 0.5,
              }}
            >
              ⌘⇧.
            </span>

            <button
              onClick={onToggleDarkMode}
              className="flex items-center justify-center transition-all duration-200 hover:opacity-70"
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDarkMode ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {isDarkMode ? (
                  <Moon style={{ width: 14, height: 14, color: "var(--yapper-accent)" }} />
                ) : (
                  <Sun style={{ width: 14, height: 14, color: "var(--yapper-accent)" }} />
                )}
              </motion.div>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center transition-all duration-200 hover:opacity-70"
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <Settings style={{ width: 14, height: 14, color: "var(--yapper-text-secondary)" }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: "32px 24px" }}>
          {/* Section header */}
          <div style={{ marginBottom: 32 }}>
            <p style={{
              fontFamily: "var(--font-body, 'Inter', sans-serif)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              fontSize: 10,
              color: "var(--yapper-accent)",
              marginBottom: 6,
            }}>
              Archive
            </p>
            <h2 style={{
              fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
              fontWeight: 800,
              fontSize: 36,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
              color: "var(--yapper-text-primary)",
              marginBottom: 8,
            }}>
              History
            </h2>
            <p style={{
              fontFamily: "var(--font-body, 'Inter', sans-serif)",
              fontWeight: 300,
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--yapper-text-secondary)",
              maxWidth: 400,
            }}>
              Your collection of captured thoughts, transcribed into an editorial gallery.
            </p>
          </div>

          {/* Bento Grid */}
          {historyItems.length === 0 ? (
            <div
              className="text-center"
              style={{
                padding: "64px 32px",
                borderRadius: 24,
                background: "var(--yapper-surface-lowest, var(--yapper-bg-lighter))",
              }}
            >
              <p style={{
                color: "var(--yapper-text-secondary)",
                fontSize: 14,
                fontWeight: 300,
              }}>
                No recordings yet. Press the widget or ⌘⇧. to start capturing.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 12,
              }}
            >
              {historyItems.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    gridColumn: getGridSpan(index, item),
                  }}
                >
                  <HistoryCard
                    timestamp={item.timestamp}
                    refinedText={item.refinedText}
                    rawTranscript={item.rawTranscript}
                    variant={getVariant(index, item)}
                    category={item.category}
                    title={item.title}
                    isPinned={item.isPinned}
                  />
                </div>
              ))}
            </div>
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
