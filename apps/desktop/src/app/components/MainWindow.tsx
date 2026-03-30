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

// --- Animated onboarding tutorial using real screenshots ---
// macOS assets
import desktopMacLight from "../../assets/desktop-light.png";
import desktopMacDark from "../../assets/desktop-dark.png";
import dockLight from "../../assets/dock-light.png";
import dockDark from "../../assets/dock-dark.png";
// Windows assets
import desktopWinLight from "../../assets/desktop-win-light.png";
import desktopWinDark from "../../assets/desktop-win-dark.png";
import taskbarLight from "../../assets/taskbar-light.png";
import taskbarDark from "../../assets/taskbar-dark.png";
// Shared
import appHistoryLight from "../../assets/app-history-light.png";
import appHistoryDark from "../../assets/app-history-dark.png";

type TutorialStep = "desktop" | "zoom" | "recording" | "processing" | "pasted" | "history";
const TUTORIAL_STEPS: { step: TutorialStep; duration: number }[] = [
  { step: "desktop", duration: 2200 },
  { step: "zoom", duration: 1800 },
  { step: "recording", duration: 2500 },
  { step: "processing", duration: 2000 },
  { step: "pasted", duration: 2800 },
  { step: "history", duration: 2500 },
];
const STEP_LABELS: Record<TutorialStep, string> = {
  desktop: "Widget sits at the bottom of your screen",
  zoom: "Hover or press your hotkey to activate",
  recording: "Speak — your voice is being captured",
  processing: "AI refines your transcript and pastes it",
  pasted: "Refined text appears right where your cursor is",
  history: "All your recordings are saved here",
};

// Image-based slideshow using real screenshots
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
  const dk = isDarkMode;

  // Pick the right image per step — platform-specific desktop/dock
  const desktopImg = isMac
    ? (dk ? desktopMacDark : desktopMacLight)
    : (dk ? desktopWinDark : desktopWinLight);
  const dockImg = isMac
    ? (dk ? dockDark : dockLight)
    : (dk ? taskbarDark : taskbarLight);
  const historyImg = dk ? appHistoryDark : appHistoryLight;

  const isZoomed = step === "zoom" || step === "recording" || step === "processing";
  const showAppWindow = step === "history";
  const showPasted = step === "pasted";

  const pillW = step === "zoom" ? 52 : step === "recording" || step === "processing" ? 160 : 50;
  const pillH = step === "zoom" ? 24 : step === "recording" || step === "processing" ? 32 : 7;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flex: 1, minHeight: "60vh", gap: 12, userSelect: "none",
    }}>
      {/* Main viewer */}
      <div style={{
        width: "min(85%, 420px)", aspectRatio: "16 / 10.5", borderRadius: 10, position: "relative",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15), 0 1px 6px rgba(0,0,0,0.08)",
        border: "1px solid rgba(0,0,0,0.1)",
      }}>
        {/* Layer 1: Desktop image — always present, zooms smoothly */}
        <motion.div
          animate={{
            scale: isZoomed ? 3.5 : showAppWindow ? 1 : 1,
          }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: "absolute", inset: 0, transformOrigin: "center 90%" }}
        >
          <img src={desktopImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
          {/* Tiny widget pill on dock — only visible at 1x */}
          <motion.div
            animate={{ opacity: step === "desktop" ? 0.6 : 0 }}
            style={{
              position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
              width: 14, height: 3, borderRadius: 2, background: "#1c1713",
              border: "0.5px solid rgba(218,119,86,0.3)",
            }}
          />
          {/* Bouncing arrow — desktop step only */}
          <motion.div
            animate={{ opacity: step === "desktop" ? 1 : 0 }}
            style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)" }}
          >
            <motion.div
              animate={{ y: [0, 3, 0] }} transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 16, height: 16, borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5 L12 19" />
                <path d="M5 12 L12 19 L19 12" />
              </svg>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Layer 2: Dock crop — fades in once zoom is underway for crisp widget */}
        <motion.div
          animate={{ opacity: isZoomed ? 1 : 0 }}
          transition={{ duration: 0.7, delay: 0, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: "absolute", inset: 0, pointerEvents: isZoomed ? "auto" : "none" }}
        >
          <img src={dockImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center bottom" }} draggable={false} />
          {/* Instruction text — just above the widget */}
          <AnimatePresence mode="wait">
            {step === "zoom" && (
              <motion.div key="inst-zoom" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                style={{
                  position: "absolute", bottom: 104, left: 0, right: 0, textAlign: "center",
                  fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.85)",
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}
              >
                Press <span style={{ color: "#DA7756", fontWeight: 700 }}>{formatHotkey(hotkey)}</span> or click widget
              </motion.div>
            )}
            {step === "recording" && (
              <motion.div key="inst-rec" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                style={{
                  position: "absolute", bottom: 104, left: 0, right: 0, textAlign: "center",
                  fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.85)",
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}
              >
                Speaking...
              </motion.div>
            )}
            {step === "processing" && (
              <motion.div key="inst-proc" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                style={{
                  position: "absolute", bottom: 104, left: 0, right: 0, textAlign: "center",
                  fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.85)",
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}
              >
                Refining with AI...
              </motion.div>
            )}
          </AnimatePresence>
          {/* Real-size widget pill */}
          <motion.div
            animate={{ width: pillW, height: pillH, borderRadius: pillH / 2 }}
            transition={{ duration: 0.35, ease: [0.34, 1.1, 0.64, 1] }}
            style={{
              position: "absolute", bottom: 70, left: "50%", x: "-50%",
              background: "#1c1713", border: "1.5px solid rgba(218,119,86,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}
          >
            <AnimatePresence mode="wait">
              {step === "zoom" && (
                <motion.div key="mic" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.15 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DA7756" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                </motion.div>
              )}
              {step === "recording" && (
                <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px" }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>✕</div>
                  <motion.div animate={{ backgroundPosition: ["0% 50%", "200% 50%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    style={{ flex: 1, height: "70%", margin: "0 4px", borderRadius: 6, background: "linear-gradient(90deg, transparent, rgba(218,119,86,0.3), rgba(245,201,168,0.2), rgba(218,119,86,0.3), transparent)", backgroundSize: "200% 100%" }}
                  />
                  <div style={{ width: 22, height: 22, borderRadius: 11, background: "#DA7756", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 1.5, background: "#fff" }} />
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
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* Layer 3: "Pasted" scene — email app with text typing in */}
        <AnimatePresence>
          {showPasted && (
            <motion.div
              key="pasted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{ position: "absolute", inset: 0 }}
            >
              <img src={desktopImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} draggable={false} />
              {/* Fake email/notes app window */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                style={{
                  position: "absolute", top: 12, left: 20, right: 20, bottom: 20,
                  borderRadius: 6, overflow: "hidden",
                  background: dk ? "#1e1a16" : "#fff",
                  border: dk ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  display: "flex", flexDirection: "column",
                }}
              >
                {/* Title bar — platform-specific window chrome */}
                <div style={{ height: 16, display: "flex", alignItems: "center", padding: "0 6px", gap: 2, background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", flexShrink: 0 }}>
                  {isMac ? (
                    <>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#ff5f57" }} />
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#febc2e" }} />
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#28c840" }} />
                      <div style={{ flex: 1, textAlign: "center", fontSize: 6, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontWeight: 500 }}>New Message</div>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, fontSize: 6, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontWeight: 500 }}>New Message</div>
                      <div style={{ display: "flex", gap: 3 }}>
                        <div style={{ width: 6, height: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)" }}>─</div>
                        <div style={{ width: 6, height: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)" }}>□</div>
                        <div style={{ width: 6, height: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)" }}>✕</div>
                      </div>
                    </>
                  )}
                </div>
                {/* Email header */}
                <div style={{ padding: "6px 10px 4px", borderBottom: dk ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: 6, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }}>To:</span>
                    <div style={{ width: "50%", height: 3, borderRadius: 1, background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 6, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }}>Subject:</span>
                    <div style={{ width: "40%", height: 3, borderRadius: 1, background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }} />
                  </div>
                </div>
                {/* Email body — text "types" in */}
                <div style={{ padding: "8px 10px", flex: 1 }}>
                  {/* Cursor blink before text appears */}
                  <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ delay: 0.4, duration: 0.1 }}
                    style={{ width: 1, height: 8, background: "#DA7756", marginBottom: 4 }}
                  />
                  {/* Lines appearing one by one */}
                  {[
                    { w: "90%", delay: 0.5 },
                    { w: "75%", delay: 0.7 },
                    { w: "85%", delay: 0.9 },
                    { w: "60%", delay: 1.1 },
                    { w: "0%", delay: 1.3 },
                    { w: "80%", delay: 1.5 },
                    { w: "70%", delay: 1.7 },
                    { w: "45%", delay: 1.9 },
                  ].map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: line.w, opacity: line.w === "0%" ? 0 : 1 }}
                      transition={{ delay: line.delay, duration: 0.25, ease: "easeOut" }}
                      style={{
                        height: i === 0 ? 4 : 3,
                        borderRadius: 1,
                        background: i === 0
                          ? (dk ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)")
                          : (dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"),
                        marginBottom: line.w === "0%" ? 6 : 4,
                        fontWeight: i === 0 ? 600 : 400,
                      }}
                    />
                  ))}
                  {/* Signature area */}
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 2.1, duration: 0.3 }}
                    style={{ marginTop: 4 }}
                  >
                    <div style={{ width: "30%", height: 3, borderRadius: 1, background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", marginBottom: 2 }} />
                    <div style={{ width: "20%", height: 2, borderRadius: 1, background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }} />
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Layer 4: History screenshot floating on desktop */}
        <AnimatePresence>
          {showAppWindow && (
            <motion.div
              key={step}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{ position: "absolute", inset: 0 }}
            >
              {/* Desktop bg behind the app window */}
              <img src={desktopImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} draggable={false} />
              {/* App screenshot centered */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                style={{ position: "absolute", top: 6, left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", alignItems: "center", zIndex: 2 }}
              >
                <img
                  src={historyImg}
                  alt=""
                  style={{
                    height: "88%",
                    borderRadius: 6,
                    objectFit: "contain",
                    boxShadow: "0 6px 28px rgba(0,0,0,0.3)",
                  }}
                  draggable={false}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Step label */}
      <AnimatePresence mode="wait">
        <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}
          style={{ fontSize: 12, color: "var(--yapper-text-secondary)", textAlign: "center", margin: 0, minHeight: 18 }}
        >
          {STEP_LABELS[step]}
        </motion.p>
      </AnimatePresence>

      {/* Step dots — clickable */}
      <div style={{ display: "flex", gap: 6 }}>
        {TUTORIAL_STEPS.map((_, i) => (
          <div key={i} onClick={() => setStepIndex(i)} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: i === stepIndex ? "#DA7756" : (dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"),
            transition: "background 0.3s",
            cursor: "pointer",
          }} />
        ))}
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
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const card = (e.target as HTMLElement).closest("[data-card-id]");
    const id = card ? card.getAttribute("data-card-id") : null;
    if (id !== hoveredRef.current) {
      hoveredRef.current = id;
      setHoveredCardId(id);
    }
  }, []);

  const clearHover = useCallback(() => {
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setHoveredCardId(null);
    }
  }, []);
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

  const availableActions = useMemo(() => {
    const actions = new Set<string>();
    historyItems.forEach(item => {
      if (item.action && item.action !== "dictation") {
        actions.add(item.action);
      }
    });
    return Array.from(actions).sort();
  }, [historyItems]);

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
    if (actionFilter) {
      items = items.filter(item => item.action === actionFilter);
    }
    return items;
  }, [searchQuery, fuse, historyItems, sortOrder, actionFilter]);

  const getVariant = (index: number, item: HistoryItem): "featured" | "compact" | "pinned" => {
    if (item.isPinned) return "pinned";
    if (index === 0 && !searchQuery) return "featured";
    return "compact";
  };

  return (
    <div
      className="w-full h-screen flex flex-col"
      style={{ background: "var(--background)", position: "relative", overflow: "hidden" }}
    >
      {/* Drag region */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ height: isMac ? 28 : 32 }}
      />

      {/* Unified header */}
      <div className="shrink-0" style={{ padding: "0 20px 0 20px" }}>
        {/* Row 1: Title left, Icons right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontWeight: 400,
            fontSize: 32,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            color: "var(--yapper-text-primary)",
            margin: 0,
          }}>
            Yapper
            <span style={{ color: "var(--yapper-accent)", fontSize: 20, position: "relative", top: -1, marginLeft: 1 }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.15, 0.7, 0.7, 0.15] }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    delay: i * 0.35,
                    times: [0, 0.2, 0.7, 1],
                    ease: "easeInOut",
                  }}
                >
                  .
                </motion.span>
              ))}
            </span>
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
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
                  <Sun style={{ width: 15, height: 15, color: "var(--yapper-accent)" }} />
                ) : (
                  <Moon style={{ width: 15, height: 15, color: "var(--yapper-accent)" }} />
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
        </div>

        {/* Search bar */}
        {historyItems.length > 0 && (
          <div style={{ marginBottom: 16, position: "relative" }}>
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
      <div ref={scrollRef} onScroll={clearHover} onMouseMove={handleMouseMove} onMouseLeave={clearHover} className={`flex-1 yapper-scroll`} style={{ padding: "12px 20px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", overflowY: filteredItems.length > 0 ? "auto" : "hidden", overflowX: "hidden", willChange: filteredItems.length > 0 ? "scroll-position" : undefined, WebkitOverflowScrolling: filteredItems.length > 0 ? "touch" : undefined, transform: "translateZ(0)" }}>
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
            {/* Action filter chips */}
            {availableActions.length > 0 && (
              <div style={{
                position: "relative",
                marginBottom: 2,
              }}>
              <div style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: 32,
                background: "linear-gradient(to right, transparent, var(--yapper-bg-lighter, #f6efe9))",
                pointerEvents: "none",
                zIndex: 1,
              }} />
              <div style={{
                display: "flex",
                gap: 8,
                flexWrap: "nowrap",
                overflowX: "auto",
                paddingRight: 24,
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}>
                <button
                  onClick={() => setActionFilter(null)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: !actionFilter ? "1px solid transparent" : "1px solid var(--yapper-border, #e5e5e5)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                    background: !actionFilter ? "#DA7756" : "var(--yapper-surface-low, #f5f5f5)",
                    color: !actionFilter ? "#fff" : "var(--yapper-text-primary)",
                    transition: "background 0.2s, color 0.2s, border-color 0.2s",
                  }}
                >
                  All
                </button>
                {availableActions.map(action => (
                  <button
                    key={action}
                    onClick={() => setActionFilter(actionFilter === action ? null : action)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 8,
                      border: actionFilter === action ? "1px solid transparent" : "1px solid var(--yapper-border, #e5e5e5)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      background: actionFilter === action ? "#DA7756" : "var(--yapper-surface-low, #f5f5f5)",
                      color: actionFilter === action ? "#fff" : "var(--yapper-text-primary)",
                      transition: "background 0.2s, color 0.2s, border-color 0.2s",
                    }}
                  >
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </button>
                ))}
              </div>
              </div>
            )}
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
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--yapper-text-secondary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 6,
                  lineHeight: 1,
                }}
              >
                <motion.div
                  animate={{ rotate: sortOrder === "oldest" ? 180 : 0 }}
                  transition={{ duration: ANIMATION.normal }}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <ArrowUpDown style={{ width: 13, height: 13 }} />
                </motion.div>
                <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
              </motion.button>
              <button
                onClick={onClearHistory}
                aria-label="Clear all history"
                className="flex items-center gap-1.5 transition-all duration-200 hover:opacity-70"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--yapper-text-secondary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 6,
                  lineHeight: 1,
                }}
              >
                <Trash2 style={{ width: 13, height: 13 }} />
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
                  isHovered={hoveredCardId === item.timestamp}
                  action={item.action}
                  actionParams={item.actionParams}
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

      {/* Fixed bottom message — only when no recordings */}
      {filteredItems.length === 0 && !searchQuery && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "16px 0 20px",
          textAlign: "center",
        }}>
          <p style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 18,
            color: isDarkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)",
            margin: 0,
            userSelect: "none",
          }}>
            Press <span style={{ color: "#DA7756", opacity: 0.6 }}>{formatHotkey(hotkey)}</span> and start yapping
          </p>
        </div>
      )}
    </div>
  );
}
