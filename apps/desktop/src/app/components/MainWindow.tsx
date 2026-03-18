import { Moon, Sun, Search, Trash2, X, Settings, ArrowUpDown } from "lucide-react";
import { HistoryCard } from "./HistoryCard";
import { motion, AnimatePresence } from "motion/react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Fuse from "fuse.js";
import type { HistoryItem } from "../lib/types";
import { FONT_SIZE, ANIMATION } from "../lib/tokens";

const isMac = navigator.platform.toUpperCase().includes("MAC");

const formatHotkey = (hk: string): string => {
  if (hk.toLowerCase() === "fn") return "fn";
  return hk
    .replace(/Cmd\+/gi, "\u2318")
    .replace(/Shift\+/gi, "\u21e7")
    .replace(/Alt\+/gi, "\u2325")
    .replace(/Ctrl\+/gi, "\u2303")
    .replace(/Meta\+/gi, "\u2318");
};

interface MainWindowProps {
  isDarkMode: boolean;
  onToggleDarkMode: (e?: React.MouseEvent) => void;
  historyItems: HistoryItem[];
  onClearHistory?: () => void;
  onDeleteItem?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onOpenSettings?: () => void;
  hotkey: string;
  conversationHotkey: string;
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

// --- Animated onboarding tutorial ---
type TutorialStep = "idle" | "hover" | "recording" | "processing" | "done" | "history";
const TUTORIAL_STEPS: { step: TutorialStep; duration: number }[] = [
  { step: "idle", duration: 1800 },
  { step: "hover", duration: 1400 },
  { step: "recording", duration: 2500 },
  { step: "processing", duration: 2000 },
  { step: "done", duration: 1600 },
  { step: "history", duration: 2200 },
];
const STEP_LABELS: Record<TutorialStep, string> = {
  idle: "Widget sits quietly at the bottom of your screen",
  hover: "Hover to reveal the microphone",
  recording: "Speak — your voice is being captured",
  processing: "AI refines your transcript...",
  done: "Polished text is pasted at your cursor",
  history: "Your recordings appear here in Yapper",
};

// Mac desktop scene: menubar with notch, fake windows, dock, widget
function MacDesktopScene({ step }: { step: TutorialStep }) {
  const isDesktopScene = step !== "history";
  const pillW = step === "idle" ? 44 : step === "hover" ? 48 : step === "done" ? 44 : 120;
  const pillH = step === "idle" ? 6 : step === "hover" || step === "done" ? 20 : 26;

  return (
    <div style={{
      width: 280, height: 190, borderRadius: 8, position: "relative",
      overflow: "hidden",
    }}>
      <AnimatePresence mode="wait">
        {isDesktopScene ? (
          <motion.div key="desktop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0, background: "#0d0b09" }}
          >
            {/* Menu bar */}
            <div style={{ height: 12, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", padding: "0 6px", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 3 }}>
                <div style={{ width: 3, height: 3, borderRadius: 1, background: "rgba(255,255,255,0.15)" }} />
                <div style={{ width: 12, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.08)", marginTop: 0.5 }} />
                <div style={{ width: 10, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", marginTop: 0.5 }} />
              </div>
              {/* Notch */}
              <div style={{
                width: 50, height: 12, borderRadius: "0 0 8px 8px",
                background: "#000", position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              }} />
              <div style={{ display: "flex", gap: 3 }}>
                <div style={{ width: 8, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)" }} />
                <div style={{ width: 3, height: 3, borderRadius: 1, background: "rgba(255,255,255,0.1)" }} />
              </div>
            </div>

            {/* Desktop wallpaper area */}
            <div style={{ flex: 1, position: "relative", height: "calc(100% - 12px - 20px)" }}>
              {/* Fake window */}
              <div style={{
                position: "absolute", top: 12, left: 20, width: 150, height: 90,
                borderRadius: 5, background: "#1c1713", border: "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}>
                <div style={{ height: 10, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", padding: "0 4px", gap: 2 }}>
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#ff5f57" }} />
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#febc2e" }} />
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#28c840" }} />
                </div>
                <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ width: "80%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)" }} />
                  <div style={{ width: "55%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.03)" }} />
                  <div style={{ width: "70%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }} />
                  <div style={{ width: "40%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.03)" }} />
                </div>
              </div>

              {/* Second fake window */}
              <div style={{
                position: "absolute", top: 25, left: 100, width: 130, height: 70,
                borderRadius: 5, background: "#1e1915", border: "1px solid rgba(255,255,255,0.05)",
                overflow: "hidden",
              }}>
                <div style={{ height: 10, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", padding: "0 4px", gap: 2 }}>
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#ff5f57" }} />
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#febc2e" }} />
                  <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#28c840" }} />
                </div>
                <div style={{ padding: "5px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ width: "60%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }} />
                  <div style={{ width: "85%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.03)" }} />
                </div>
              </div>
            </div>

            {/* Dock */}
            <div style={{
              position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
              display: "flex", gap: 3, padding: "3px 8px",
              background: "rgba(255,255,255,0.04)", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              {[0,1,2,3,4,5,6].map(i => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: i === 3 ? "rgba(218,119,86,0.3)" : `rgba(255,255,255,${0.04 + i * 0.01})`,
                }} />
              ))}
            </div>

            {/* Arrow pointing to widget */}
            <AnimatePresence>
              {step === "idle" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                  style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)" }}
                >
                  <motion.svg width="10" height="16" viewBox="0 0 10 16" fill="none"
                    animate={{ y: [0, 3, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <line x1="5" y1="0" x2="5" y2="11" stroke="rgba(218,119,86,0.5)" strokeWidth="1.5" strokeDasharray="2 2" />
                    <path d="M1.5 10 L5 15 L8.5 10" stroke="rgba(218,119,86,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Widget pill above dock */}
            <motion.div
              animate={{ width: pillW, height: pillH, borderRadius: pillH / 2, opacity: step === "idle" ? 0.5 : 1 }}
              transition={{ duration: 0.35, ease: [0.34, 1.1, 0.64, 1] }}
              style={{
                position: "absolute", bottom: 22, left: "50%", x: "-50%",
                background: "#1c1713", border: "1px solid rgba(218,119,86,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}
            >
              <AnimatePresence mode="wait">
                {step === "hover" && (
                  <motion.div key="mic" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#DA7756" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                  </motion.div>
                )}
                {step === "recording" && (
                  <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 4px" }}
                  >
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>✕</div>
                    <motion.div animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      style={{ flex: 1, height: "65%", margin: "0 2px", borderRadius: 4, background: "linear-gradient(90deg, transparent, rgba(218,119,86,0.3), rgba(245,201,168,0.2), rgba(218,119,86,0.3), transparent)", backgroundSize: "200% 100%" }}
                    />
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#DA7756", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <div style={{ width: 4, height: 4, borderRadius: 1, background: "#fff" }} />
                    </div>
                  </motion.div>
                )}
                {step === "processing" && (
                  <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ width: "100%", height: "100%", borderRadius: "inherit", overflow: "hidden" }}
                  >
                    <motion.div animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      style={{ width: "100%", height: "100%", borderRadius: "inherit", background: "linear-gradient(90deg, #1c1713, #DA7756, #e8a87c, #f5c9a8, #e8a87c, #DA7756, #1c1713)", backgroundSize: "200% 100%" }}
                    />
                  </motion.div>
                )}
                {step === "done" && (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#DA7756" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 L9 17 L4 12" />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : (
          /* History scene: Yapper app mockup showing a card */
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0, background: "#1c1713", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {/* App title bar */}
            <div style={{ height: 14, display: "flex", alignItems: "center", padding: "0 6px", gap: 2 }}>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#28c840" }} />
            </div>
            {/* Yapper. title */}
            <div style={{ textAlign: "center", padding: "2px 0 6px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)", fontFamily: "'DM Serif Display', serif" }}>Yapper</span>
              <span style={{ fontSize: 11, color: "#DA7756", fontFamily: "'DM Serif Display', serif" }}>.</span>
            </div>
            {/* Search bar mock */}
            <div style={{ margin: "0 12px 6px", height: 14, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }} />
            {/* History card appearing */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              style={{
                margin: "0 12px", borderRadius: 8, padding: "8px 10px",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <div style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(218,119,86,0.15)", fontSize: 6, color: "#DA7756", fontWeight: 600 }}>NOTE</div>
              </div>
              <div style={{ width: "85%", height: 3, borderRadius: 1, background: "rgba(255,255,255,0.12)", marginBottom: 4 }} />
              <div style={{ width: "70%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", marginBottom: 2 }} />
              <div style={{ width: "90%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)", marginBottom: 2 }} />
              <div style={{ width: "50%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)" }} />
            </motion.div>
            {/* Second card hint */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 0.5, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              style={{
                margin: "6px 12px 0", borderRadius: 8, padding: "6px 10px",
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ width: "60%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", marginBottom: 3 }} />
              <div style={{ width: "80%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.03)" }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OnboardingTutorial({ hotkey, conversationHotkey, formatHotkey, isDarkMode }: {
  hotkey: string; conversationHotkey: string; formatHotkey: (hk: string) => string; isDarkMode: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const current = TUTORIAL_STEPS[stepIndex];

  useEffect(() => {
    const timer = setTimeout(() => {
      setStepIndex((i) => (i + 1) % TUTORIAL_STEPS.length);
    }, current.duration);
    return () => clearTimeout(timer);
  }, [stepIndex, current.duration]);

  const step = current.step;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flex: 1, minHeight: "60vh", gap: 16, userSelect: "none",
    }}>
      <MacDesktopScene step={step} />

      {/* Step label */}
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}
          style={{ fontSize: 12, color: "var(--yapper-text-secondary)", textAlign: "center", margin: 0, minHeight: 18 }}
        >
          {STEP_LABELS[step]}
        </motion.p>
      </AnimatePresence>

      {/* Step dots */}
      <div style={{ display: "flex", gap: 6 }}>
        {TUTORIAL_STEPS.map((_, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            background: i === stepIndex ? "#DA7756" : (isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"),
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      {/* Hotkey hints */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, marginTop: 2 }}>
        <p style={{ color: isDarkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.2)", fontSize: 14, fontWeight: 400, margin: 0 }}>
          press <span style={{ fontWeight: 600 }}>{formatHotkey(hotkey)}</span> to start Yapping...
        </p>
        <p style={{ color: isDarkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)", fontSize: 12, fontWeight: 400, margin: 0 }}>
          <span style={{ fontWeight: 600 }}>{formatHotkey(conversationHotkey)}</span> to start a conversation
        </p>
      </div>
    </div>
  );
}

export function MainWindow({
  isDarkMode,
  onToggleDarkMode,
  historyItems,
  onClearHistory,
  onDeleteItem,
  onTogglePin,
  onOpenSettings,
  hotkey,
  conversationHotkey,
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
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center justify-center hover:opacity-70"
              style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", outline: "none" }}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDarkMode ? 180 : 0 }}
                transition={{ duration: ANIMATION.normal }}
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
              aria-label="Open settings"
              className="flex items-center justify-center hover:opacity-70"
              style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", outline: "none" }}
            >
              <Settings style={{ width: 15, height: 15, color: "var(--yapper-accent)" }} />
            </button>
          </div>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontWeight: 400,
            fontSize: 38, // brand title, intentionally not tokenized
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
                    fontSize: FONT_SIZE.base,
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
                      fontSize: FONT_SIZE.base,
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
                  aria-label="Clear search"
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
          searchQuery ? (
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
                No results for &ldquo;{searchQuery}&rdquo;. Try a different search.
              </p>
            </div>
          ) : (
            <OnboardingTutorial hotkey={hotkey} conversationHotkey={conversationHotkey} formatHotkey={formatHotkey} isDarkMode={isDarkMode} />
          )
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
                aria-label={`Sort by ${sortOrder === "newest" ? "oldest" : "newest"}`}
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
                  transition={{ duration: ANIMATION.normal }}
                  style={{ display: "flex" }}
                >
                  <ArrowUpDown style={{ width: 11, height: 11 }} />
                </motion.div>
                <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
              </motion.button>
              <button
                onClick={onClearHistory}
                aria-label="Clear all history"
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
        {filteredItems.length > 0 && (
          <div style={{
            textAlign: "center",
            padding: "20px 0 40px",
            fontSize: 12,
            color: isDarkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
            userSelect: "none",
          }}>
            Press {formatHotkey(conversationHotkey)} to start a conversation
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
