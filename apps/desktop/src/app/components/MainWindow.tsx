import { Settings, Moon, Sun, Search, Trash2, X } from "lucide-react";
import { HistoryCard } from "./HistoryCard";
import { SettingsDialog } from "./SettingsDialog";
import { motion, AnimatePresence } from "motion/react";
import { useState, useMemo } from "react";
import Fuse from "fuse.js";
import type { AppSettings, HistoryItem } from "../lib/types";

interface MainWindowProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  historyItems: HistoryItem[];
  settings?: AppSettings;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
  onClearHistory?: () => void;
  onTogglePin?: (id: string) => void;
}

export function MainWindow({
  isDarkMode,
  onToggleDarkMode,
  historyItems,
  settings,
  onUpdateSettings,
  onClearHistory,
  onTogglePin,
}: MainWindowProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Fuse.js fuzzy search — handles typos, partial matches, ranking
  const fuse = useMemo(
    () =>
      new Fuse(historyItems, {
        keys: [
          { name: "title", weight: 0.4 },
          { name: "refinedText", weight: 0.3 },
          { name: "rawTranscript", weight: 0.15 },
          { name: "category", weight: 0.15 },
        ],
        threshold: 0.4, // 0 = exact, 1 = match anything
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 2,
      }),
    [historyItems]
  );

  const filteredItems = useMemo(() => {
    const items = searchQuery.trim()
      ? fuse.search(searchQuery).map((r) => r.item)
      : historyItems;
    // Pinned items first
    return [...items].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [searchQuery, fuse, historyItems]);

  // Determine card variants based on position
  const getVariant = (index: number, item: HistoryItem): "featured" | "compact" | "pinned" => {
    if (item.isPinned) return "pinned";
    if (index === 0 && !searchQuery) return "featured";
    return "compact";
  };

  const getGridSpan = (index: number, item: HistoryItem): string => {
    if (item.isPinned || (index === 0 && !searchQuery)) return "1 / -1";
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
              style={{ width: 26, height: 26, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", outline: "none" }}
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
              style={{ width: 26, height: 26, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", outline: "none" }}
            >
              <Settings style={{ width: 14, height: 14, color: "var(--yapper-text-secondary)" }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: "28px 20px" }}>
          {/* Section header */}
          <div style={{ marginBottom: 20 }}>
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
            <div className="flex items-center justify-between">
              <h2 style={{
                fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
                fontWeight: 800,
                fontSize: 32,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
                color: "var(--yapper-text-primary)",
              }}>
                History
              </h2>
              {historyItems.length > 0 && (
                <button
                  onClick={onClearHistory}
                  className="flex items-center gap-1.5 transition-all duration-200 hover:opacity-70"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--yapper-text-secondary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: 6,
                  }}
                >
                  <Trash2 style={{ width: 12, height: 12 }} />
                  <span>Clear all</span>
                </button>
              )}
            </div>
            <p style={{
              fontFamily: "var(--font-body, 'Inter', sans-serif)",
              fontWeight: 300,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--yapper-text-secondary)",
              marginTop: 6,
              maxWidth: 360,
            }}>
              Your collection of captured thoughts, transcribed into an editorial gallery.
            </p>
          </div>

          {/* Search bar */}
          {historyItems.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                position: "relative",
              }}
            >
              <div
                className="flex items-center"
                style={{
                  borderRadius: 12,
                  padding: "0 12px",
                  height: 36,
                  background: "var(--yapper-surface-low, var(--yapper-bg-light))",
                  border: isSearchFocused ? "1px solid var(--yapper-accent)" : "1px solid transparent",
                  transition: "border-color 0.2s",
                }}
              >
                <Search style={{
                  width: 14,
                  height: 14,
                  color: "var(--yapper-text-secondary)",
                  opacity: 0.5,
                  flexShrink: 0,
                }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="Search recordings..."
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 13,
                    fontWeight: 400,
                    color: "var(--yapper-text-primary)",
                    marginLeft: 8,
                    fontFamily: "var(--font-body, 'Inter', sans-serif)",
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <X style={{ width: 14, height: 14, color: "var(--yapper-text-secondary)" }} />
                  </button>
                )}
              </div>
              {searchQuery && (
                <p style={{
                  fontSize: 11,
                  color: "var(--yapper-text-secondary)",
                  marginTop: 6,
                  paddingLeft: 4,
                }}>
                  {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
              )}
            </div>
          )}

          {/* Bento Grid */}
          {filteredItems.length === 0 ? (
            <div
              className="text-center"
              style={{
                padding: "48px 24px",
                borderRadius: 24,
                background: "var(--yapper-surface-lowest, var(--yapper-bg-lighter))",
              }}
            >
              <p style={{
                color: "var(--yapper-text-secondary)",
                fontSize: 13,
                fontWeight: 300,
              }}>
                {searchQuery
                  ? `No results for "${searchQuery}". Try a different search.`
                  : "No recordings yet. Press the widget or ⌘⇧. to start capturing."
                }
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 10,
                alignItems: "start",
              }}
            >
              <AnimatePresence>
                {filteredItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    style={{ gridColumn: getGridSpan(index, item) }}
                  >
                    <HistoryCard
                      timestamp={item.timestamp}
                      refinedText={item.refinedText}
                      rawTranscript={item.rawTranscript}
                      variant={getVariant(index, item)}
                      category={item.category}
                      title={item.title}
                      isPinned={item.isPinned}
                      onTogglePin={() => onTogglePin?.(item.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
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
