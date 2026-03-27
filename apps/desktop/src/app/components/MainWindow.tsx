import { Moon, Sun, Search, Trash2, X, Settings, ArrowUpDown } from "lucide-react";
import { HistoryCard } from "./HistoryCard";
import { motion, AnimatePresence } from "motion/react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Fuse from "fuse.js";
import type { HistoryItem } from "../lib/types";

const isMac = navigator.platform.toUpperCase().includes("MAC");

function YappButton({ onClick }: { onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.9 }}
      animate={{
        scale: hovered ? 1.08 : 1,
        y: hovered ? -3 : 0,
      }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      style={{
        pointerEvents: "auto",
        position: "relative",
        width: 52,
        height: 48,
        background: "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "24px 24px 24px 8px",
        boxShadow: hovered
          ? "0 8px 32px rgba(218,119,86,0.5), 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 1px rgba(0,0,0,0.1)"
          : "0 4px 16px rgba(218,119,86,0.3), 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 1px rgba(0,0,0,0.1)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow on hover */}
      <motion.div
        animate={{
          opacity: hovered ? 1 : 0,
          scale: hovered ? 1.5 : 0.8,
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          position: "absolute",
          inset: -12,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,220,180,0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Inner shimmer on hover */}
      <motion.div
        animate={{
          opacity: hovered ? 0.6 : 0,
        }}
        transition={{ duration: 0.3 }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.2) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />
      {/* Y. text */}
      <span
        style={{
          position: "relative",
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22,
          fontWeight: 400,
          color: "#fff",
          lineHeight: 1,
        }}
      >
        Y
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.7)", marginLeft: 0, verticalAlign: "baseline", position: "relative", top: 0 }}>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
                times: [0, 0.2, 0.7, 1],
                ease: "easeInOut",
              }}
            >
              .
            </motion.span>
          ))}
        </span>
      </span>
    </motion.button>
  );
}


interface MainWindowProps {
  isDarkMode: boolean;
  onToggleDarkMode: (e?: React.MouseEvent) => void;
  historyItems: HistoryItem[];
  onClearHistory?: () => void;
  onDeleteItem?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onStartConversation?: () => void;
  onOpenSettings?: () => void;
}

const SEARCH_EXAMPLES = [
  "meeting notes from today",
  "that idea about the UI",
  "interview with the design team",
  "quick thought about onboarding",
  "email draft to the client",
  "weekly retro highlights",
];

function useTypingPlaceholder(active: boolean) {
  const [text, setText] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }

    const example = SEARCH_EXAMPLES[exampleIndex % SEARCH_EXAMPLES.length];

    if (pause) {
      const t = setTimeout(() => {
        setPause(false);
        setIsDeleting(true);
      }, 2000);
      return () => clearTimeout(t);
    }

    if (isDeleting) {
      if (charIndex > 0) {
        const t = setTimeout(() => {
          setCharIndex((c) => c - 1);
          setText(example.slice(0, charIndex - 1));
        }, 25);
        return () => clearTimeout(t);
      } else {
        setIsDeleting(false);
        setExampleIndex((i) => (i + 1) % SEARCH_EXAMPLES.length);
      }
    } else {
      if (charIndex < example.length) {
        const t = setTimeout(() => {
          setCharIndex((c) => c + 1);
          setText(example.slice(0, charIndex + 1));
        }, 55);
        return () => clearTimeout(t);
      } else {
        setPause(true);
      }
    }
  }, [active, charIndex, isDeleting, exampleIndex, pause]);

  // Reset when becoming active
  useEffect(() => {
    if (active) {
      setCharIndex(0);
      setText("");
      setIsDeleting(false);
      setPause(false);
    }
  }, [active]);

  return text;
}

export function MainWindow({
  isDarkMode,
  onToggleDarkMode,
  historyItems,
  onClearHistory,
  onDeleteItem,
  onTogglePin,
  onStartConversation,
  onOpenSettings,
}: MainWindowProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const showAnimatedPlaceholder = !searchQuery && !isSearchFocused;
  const animatedPlaceholder = useTypingPlaceholder(showAnimatedPlaceholder);

  // When switching to Modern STT, check if the speech permission is enabled
  // Fuse.js fuzzy search — handles typos, partial matches, ranking
  const fuse = useMemo(
    () => {
      // Filter out items with missing required fields to prevent Fuse.js crashes
      const validItems = historyItems.filter((item) => item && item.id && item.refinedText != null);
      return new Fuse(validItems, {
        keys: [
          { name: "title", weight: 0.4 },
          { name: "refinedText", weight: 0.3 },
          { name: "rawTranscript", weight: 0.15 },
          { name: "category", weight: 0.15 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 2,
      });
    },
    [historyItems]
  );

  const filteredItems = useMemo(() => {
    let items: HistoryItem[];
    const query = searchQuery.trim();
    if (query && query.length >= 2) {
      try {
        items = fuse.search(query).map((r) => r.item);
      } catch {
        const q = query.toLowerCase();
        items = historyItems.filter((item) =>
          (item.title || "").toLowerCase().includes(q) ||
          (item.refinedText || "").toLowerCase().includes(q) ||
          (item.category || "").toLowerCase().includes(q)
        );
      }
    } else if (query && query.length === 1) {
      // Single char — simple filter, skip Fuse.js
      const q = query.toLowerCase();
      items = historyItems.filter((item) =>
        (item.title || "").toLowerCase().includes(q) ||
        (item.refinedText || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q)
      );
    } else {
      items = [...historyItems];
    }
    if (sortOrder === "oldest") {
      items = [...items].reverse();
    }
    return items;
  }, [searchQuery, fuse, historyItems, sortOrder]);

  const getVariant = (index: number, item: HistoryItem): "featured" | "compact" | "pinned" => {
    if (item.isPinned) return "pinned";
    if (index === 0 && !searchQuery) return "featured";
    return "compact";
  };

  return (
    <div
      className="w-full h-screen flex flex-col"
      style={{ background: "var(--background)" }}
    >
      {/* Drag region */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ height: isMac ? 28 : 32 }}
      />

      {/* Unified header */}
      <div className="shrink-0" style={{ padding: "0 20px 0 20px" }}>
        {/* Row 1: Icons left, Title center, Icons right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 14 }}>
          <div style={{ position: "absolute", right: 0, display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={onToggleDarkMode}
              className="flex items-center justify-center hover:opacity-70"
              style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", outline: "none" }}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDarkMode ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {isDarkMode ? (
                  <Moon style={{ width: 15, height: 15, color: "var(--yapper-accent)" }} />
                ) : (
                  <Sun style={{ width: 15, height: 15, color: "var(--yapper-accent)" }} />
                )}
              </motion.div>
            </button>
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center hover:opacity-70"
              style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", outline: "none" }}
            >
              <Settings style={{ width: 15, height: 15, color: "var(--yapper-accent)" }} />
            </button>
          </div>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontWeight: 400,
            fontSize: 38,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            color: "var(--yapper-text-primary)",
          }}>
            Yapper
            <span style={{ color: "var(--yapper-accent)", fontSize: 12, position: "relative", top: 1, marginLeft: 0 }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.3,
                    times: [0, 0.2, 0.7, 1],
                    ease: "easeInOut",
                  }}
                >
                  .
                </motion.span>
              ))}
            </span>
          </h2>
        </div>

        {/* Search bar */}
        {historyItems.length > 0 && (
          <div style={{ marginBottom: 0, position: "relative" }}>
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
              <div style={{ flex: 1, position: "relative", marginLeft: 8 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder={isSearchFocused ? "Search..." : ""}
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 13,
                    fontWeight: 400,
                    color: "var(--yapper-text-primary)",
                    fontFamily: "var(--font-body, 'Inter', sans-serif)",
                  }}
                />
                {showAnimatedPlaceholder && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: "flex",
                      alignItems: "center",
                      pointerEvents: "none",
                      fontSize: 13,
                      fontWeight: 400,
                      color: "var(--yapper-text-secondary)",
                      opacity: 0.45,
                      fontFamily: "var(--font-body, 'Inter', sans-serif)",
                    }}
                  >
                    {animatedPlaceholder}
                    <span
                      style={{
                        display: "inline-block",
                        width: 1,
                        height: 14,
                        background: "var(--yapper-text-secondary)",
                        marginLeft: 1,
                        opacity: 0.6,
                        animation: "blink 1s step-end infinite",
                      }}
                    />
                  </div>
                )}
              </div>
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
      </div>

      {/* Scrollable card list */}
      <div className="flex-1 overflow-y-auto yapper-scroll" style={{ padding: "12px 20px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 720 }}>
        {filteredItems.length === 0 ? (
          <div
            className="text-center"
            style={{
              padding: "48px 24px",
              borderRadius: 16,
              background: "var(--yapper-surface-lowest, var(--yapper-bg-lighter))",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            }}
          >
            <p style={{
              color: "var(--yapper-text-secondary)",
              fontSize: 13,
              fontWeight: 400,
            }}>
              {searchQuery
                ? `No results for \u201c${searchQuery}\u201d. Try a different search.`
                : "No recordings yet. Press the widget or \u2318\u21e7. to start capturing."
              }
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Toolbar: sort + metrics + clear */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <motion.button
                onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                className="flex items-center gap-1.5 hover:opacity-70"
                whileTap={{ scale: 0.95 }}
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
                <motion.div
                  animate={{ rotate: sortOrder === "oldest" ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ display: "flex" }}
                >
                  <ArrowUpDown style={{ width: 11, height: 11 }} />
                </motion.div>
                <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
              </motion.button>
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
                <Trash2 style={{ width: 11, height: 11 }} />
                <span>Clear all</span>
              </button>
            </div>
            <AnimatePresence>
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={false}
                animate={{ opacity: 1, scale: 1, height: "auto" }}
                exit={{
                  opacity: 0,
                  scale: 0.95,
                  height: 0,
                  marginBottom: 0,
                  overflow: "hidden",
                }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
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
                  onDelete={() => onDeleteItem?.(item.id)}
                  entryType={item.entryType}
                  conversation={item.conversation}
                  durationSeconds={item.durationSeconds}
                />
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
        </div>
      </div>

      {/* Floating Y button */}
      <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
        <YappButton onClick={onStartConversation} />
      </div>
    </div>
  );
}
