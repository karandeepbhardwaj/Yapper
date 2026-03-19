import { Moon, Sun, Search, Trash2, X, Keyboard, MessageCircle } from "lucide-react";
import { HistoryCard } from "./HistoryCard";
import { motion, AnimatePresence } from "motion/react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Fuse from "fuse.js";
import type { HistoryItem } from "../lib/types";
import { checkSpeechPermission } from "../lib/tauri-bridge";
import fnKeySettingsImg from "../../assets/fn-key-settings.png";
import winSpeechSettingsImg from "../../assets/windows-speech-settings.png";

const isMac = navigator.platform.toUpperCase().includes("MAC");

const isWindows = !navigator.platform.toUpperCase().includes("MAC");

interface MainWindowProps {
  isDarkMode: boolean;
  onToggleDarkMode: (e?: React.MouseEvent) => void;
  historyItems: HistoryItem[];
  hotkey: string;
  onHotkeyChange?: (hotkey: string) => void;
  sttEngine?: "classic" | "modern";
  onSttEngineChange?: (engine: "classic" | "modern") => void;
  onClearHistory?: () => void;
  onDeleteItem?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onStartConversation?: () => void;
}

function formatHotkeyDisplay(hotkey: string): string {
  if (hotkey.toLowerCase() === "fn") return "fn";
  return hotkey
    .replace(/Cmd\+/gi, "\u2318")
    .replace(/Shift\+/gi, "\u21e7")
    .replace(/Alt\+/gi, "\u2325")
    .replace(/Ctrl\+/gi, "\u2303")
    .replace(/Meta\+/gi, "\u2318");
}

function keyEventToHotkey(e: KeyboardEvent): string | null {
  // Fn key can't be detected via keydown (macOS intercepts it).
  // It's handled via the dedicated "use fn" button instead.

  // Need at least one modifier for all other keys
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) return null;
  // Ignore lone modifier presses
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey) parts.push("Cmd");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Use e.code (physical key) to avoid Shift changing "/" to "?" etc.
  const codeMap: Record<string, string> = {
    KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D", KeyE: "E", KeyF: "F",
    KeyG: "G", KeyH: "H", KeyI: "I", KeyJ: "J", KeyK: "K", KeyL: "L",
    KeyM: "M", KeyN: "N", KeyO: "O", KeyP: "P", KeyQ: "Q", KeyR: "R",
    KeyS: "S", KeyT: "T", KeyU: "U", KeyV: "V", KeyW: "W", KeyX: "X",
    KeyY: "Y", KeyZ: "Z",
    Digit0: "0", Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4",
    Digit5: "5", Digit6: "6", Digit7: "7", Digit8: "8", Digit9: "9",
    Period: ".", Comma: ",", Slash: "/", Backslash: "\\",
    Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]",
    Minus: "-", Equal: "=", Backquote: "`", Space: "Space",
    Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete",
    Escape: "Escape",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
    F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  };
  const key = codeMap[e.code];
  if (!key) return null; // Unknown key

  parts.push(key);
  return parts.join("+");
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
  hotkey,
  onHotkeyChange,
  sttEngine = "classic",
  onSttEngineChange,
  onClearHistory,
  onDeleteItem,
  onTogglePin,
  onStartConversation,
}: MainWindowProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [showFnTooltip, setShowFnTooltip] = useState(false);
  const [showSpeechTooltip, setShowSpeechTooltip] = useState(false);
  const hotkeyBadgeRef = useRef<HTMLButtonElement>(null);
  const showAnimatedPlaceholder = !searchQuery && !isSearchFocused;
  const animatedPlaceholder = useTypingPlaceholder(showAnimatedPlaceholder);

  // When switching to Modern STT, check if the speech permission is enabled
  const handleSttEngineChange = useCallback(async (engine: "classic" | "modern") => {
    if (engine === "modern" && isWindows) {
      try {
        const enabled = await checkSpeechPermission();
        if (!enabled) {
          setShowSpeechTooltip(true);
        }
      } catch {
        // If check fails, show tooltip to be safe
        setShowSpeechTooltip(true);
      }
    } else {
      setShowSpeechTooltip(false);
    }
    onSttEngineChange?.(engine);
  }, [onSttEngineChange]);

  const [hotkeyDebug, setHotkeyDebug] = useState("");

  const handleHotkeyRecord = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setHotkeyDebug(`key="${e.key}" code="${e.code}"`);

    if (e.key === "Escape") {
      setIsRecordingHotkey(false);
      setHotkeyDebug("");
      return;
    }

    const newHotkey = keyEventToHotkey(e);
    setHotkeyDebug(`key="${e.key}" code="${e.code}" → ${newHotkey ?? "null"}`);

    if (newHotkey) {
      onHotkeyChange?.(newHotkey);
      setIsRecordingHotkey(false);
      setHotkeyDebug("");
      if (newHotkey === "Fn") {
        setShowFnTooltip(true);
      }
    }
  }, [onHotkeyChange]);

  useEffect(() => {
    if (isRecordingHotkey) {
      window.addEventListener("keydown", handleHotkeyRecord, true);
      return () => window.removeEventListener("keydown", handleHotkeyRecord, true);
    }
  }, [isRecordingHotkey, handleHotkeyRecord]);

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
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 2,
      }),
    [historyItems]
  );

  const filteredItems = useMemo(() => {
    if (searchQuery.trim()) {
      return fuse.search(searchQuery).map((r) => r.item);
    }
    // Keep chronological order — pinned items stay in their timeline position
    return historyItems;
  }, [searchQuery, fuse, historyItems]);

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
      {/* Title bar */}
      <div
        className="flex items-center justify-between shrink-0"
        data-tauri-drag-region
        style={{
          background: "var(--background)",
          height: 38,
          paddingLeft: isMac ? 78 : 12,
          paddingRight: 12,
        }}
      >
        {isMac && (
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
        )}
        {!isMac && <div data-tauri-drag-region style={{ flex: 1 }} />}

        <div className="flex items-center" style={{ gap: 6, position: "relative" }}>
          {!isRecordingHotkey ? (
            <button
              ref={hotkeyBadgeRef}
              onClick={() => {
                if (showFnTooltip) {
                  setShowFnTooltip(false);
                } else {
                  setIsRecordingHotkey(true);
                }
              }}
              title="Click to change hotkey"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 6,
                color: "var(--yapper-text-secondary)",
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                opacity: 0.5,
                background: "transparent",
                border: "1px solid transparent",
                cursor: "pointer",
                outline: "none",
                transition: "all 0.2s",
              }}
            >
              <Keyboard style={{ width: 11, height: 11, opacity: 0.7 }} />
              {formatHotkeyDisplay(hotkey)}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  borderRadius: 6,
                  color: "var(--yapper-accent)",
                  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  background: "var(--yapper-surface-low, var(--yapper-bg-light))",
                  border: "1px solid var(--yapper-accent)",
                }}
              >
                Press shortcut{"\u2026"}
              </span>
              {isMac && (
                <button
                  onClick={() => {
                    onHotkeyChange?.("Fn");
                    setIsRecordingHotkey(false);
                    setShowFnTooltip(true);
                  }}
                  style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 5,
                    color: "var(--yapper-text-secondary)",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    background: "var(--yapper-surface-low, var(--yapper-bg-light))",
                    border: "1px solid var(--yapper-border)",
                    cursor: "pointer",
                    outline: "none",
                    opacity: 0.8,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "var(--yapper-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.8"; e.currentTarget.style.borderColor = "var(--yapper-border)"; }}
                >
                  use fn
                </button>
              )}
              <button
                onClick={() => setIsRecordingHotkey(false)}
                style={{
                  fontSize: 9,
                  padding: "2px 4px",
                  borderRadius: 5,
                  color: "var(--yapper-text-secondary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  outline: "none",
                  opacity: 0.4,
                }}
                title="Cancel"
              >
                esc
              </button>
            </div>
          )}

          {/* Fn key setup tooltip (macOS only) */}
          <AnimatePresence>
            {isMac && showFnTooltip && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  right: 0,
                  width: 320,
                  padding: 16,
                  borderRadius: 16,
                  background: "var(--yapper-surface-lowest, #ffffff)",
                  border: "1px solid var(--yapper-border)",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
                  zIndex: 100,
                }}
              >
                {/* Tooltip arrow */}
                <div style={{
                  position: "absolute",
                  top: -6,
                  right: 16,
                  width: 12,
                  height: 12,
                  background: "var(--yapper-surface-lowest, #ffffff)",
                  border: "1px solid var(--yapper-border)",
                  borderBottom: "none",
                  borderRight: "none",
                  transform: "rotate(45deg)",
                }} />

                <div style={{ position: "relative" }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--yapper-text-primary)",
                      fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
                    }}>
                      Setup Required
                    </span>
                    <button
                      onClick={() => setShowFnTooltip(false)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        display: "flex",
                        opacity: 0.5,
                      }}
                    >
                      <X style={{ width: 14, height: 14, color: "var(--yapper-text-secondary)" }} />
                    </button>
                  </div>

                  <p style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--yapper-text-secondary)",
                    marginBottom: 12,
                  }}>
                    To use the <strong style={{ color: "var(--yapper-text-primary)" }}>fn</strong> key as your hotkey, open{" "}
                    <strong style={{ color: "var(--yapper-text-primary)" }}>System Settings &rarr; Keyboard</strong>{" "}
                    and set <strong style={{ color: "var(--yapper-text-primary)" }}>"Press {"\uD83C\uDF10"} key to"</strong> to{" "}
                    <strong style={{ color: "var(--yapper-accent)" }}>Do Nothing</strong>.
                  </p>

                  <div style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--yapper-border)",
                  }}>
                    <img
                      src={fnKeySettingsImg}
                      alt="macOS Keyboard settings showing Press fn key set to Do Nothing"
                      style={{
                        width: "100%",
                        display: "block",
                      }}
                    />
                  </div>

                  <p style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "var(--yapper-text-secondary)",
                    marginTop: 10,
                    opacity: 0.7,
                  }}>
                    Otherwise macOS will intercept the key for Dictation or Emoji.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STT engine segmented toggle — Windows only */}
          {isWindows && (
            <div
              title={sttEngine === "classic"
                ? "Classic: offline SAPI5 — no settings needed"
                : "Modern: WinRT — more accurate, requires Settings > Privacy > Speech"}
              style={{
                display: "flex",
                alignItems: "center",
                position: "relative",
                borderRadius: 7,
                background: "var(--yapper-surface-low, var(--yapper-bg-light))",
                border: "1px solid var(--yapper-border)",
                padding: 1,
                gap: 0,
              }}
            >
              {/* Sliding highlight pill */}
              <motion.div
                layout="position"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                style={{
                  position: "absolute",
                  top: 1,
                  bottom: 1,
                  left: sttEngine === "classic" ? 1 : "50%",
                  width: "calc(50% - 1px)",
                  borderRadius: 6,
                  background: "var(--yapper-surface-lowest, #ffffff)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              />
              {(["classic", "modern"] as const).map((eng) => (
                <button
                  key={eng}
                  onClick={() => handleSttEngineChange(eng)}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    fontSize: 9,
                    fontWeight: sttEngine === eng ? 600 : 400,
                    padding: "2px 7px",
                    borderRadius: 6,
                    color: sttEngine === eng ? "var(--yapper-accent)" : "var(--yapper-text-secondary)",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    opacity: sttEngine === eng ? 1 : 0.55,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    outline: "none",
                    transition: "color 0.25s, opacity 0.25s, font-weight 0.25s",
                  }}
                >
                  {eng === "classic" ? "Classic" : "Modern"}
                </button>
              ))}
            </div>
          )}

          {/* Windows speech permission tooltip */}
          <AnimatePresence>
            {isWindows && showSpeechTooltip && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  right: 0,
                  width: 340,
                  padding: 16,
                  borderRadius: 16,
                  background: "var(--yapper-surface-lowest, #ffffff)",
                  border: "1px solid var(--yapper-border)",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
                  zIndex: 100,
                }}
              >
                {/* Tooltip arrow */}
                <div style={{
                  position: "absolute",
                  top: -6,
                  right: 50,
                  width: 12,
                  height: 12,
                  background: "var(--yapper-surface-lowest, #ffffff)",
                  border: "1px solid var(--yapper-border)",
                  borderBottom: "none",
                  borderRight: "none",
                  transform: "rotate(45deg)",
                }} />

                <div style={{ position: "relative" }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--yapper-text-primary)",
                      fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
                    }}>
                      Enable Speech Recognition
                    </span>
                    <button
                      onClick={() => setShowSpeechTooltip(false)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        display: "flex",
                        opacity: 0.5,
                      }}
                    >
                      <X style={{ width: 14, height: 14, color: "var(--yapper-text-secondary)" }} />
                    </button>
                  </div>

                  <p style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--yapper-text-secondary)",
                    marginBottom: 12,
                  }}>
                    To use <strong style={{ color: "var(--yapper-text-primary)" }}>Modern</strong> speech recognition, open{" "}
                    <strong style={{ color: "var(--yapper-text-primary)" }}>Settings &rarr; Privacy &amp; security &rarr; Speech</strong>{" "}
                    and turn on{" "}
                    <strong style={{ color: "var(--yapper-accent)" }}>Online speech recognition</strong>.
                  </p>

                  <div style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--yapper-border)",
                  }}>
                    <img
                      src={winSpeechSettingsImg}
                      alt="Windows Privacy & security > Speech settings with Online speech recognition toggled On"
                      style={{
                        width: "100%",
                        display: "block",
                      }}
                    />
                  </div>

                  <p style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "var(--yapper-text-secondary)",
                    marginTop: 10,
                    opacity: 0.7,
                  }}>
                    Without this, the app will fall back to Classic mode which has lower accuracy.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
        </div>
      </div>

      {/* Fixed header area */}
      <div className="shrink-0" style={{ padding: "20px 20px 0 20px" }}>
        {/* Section header */}
        <div style={{ marginBottom: 16 }}>
          <p style={{
            fontFamily: "var(--font-body, 'Inter', sans-serif)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: 10,
            color: "var(--yapper-accent)",
            marginBottom: 6,
          }}>
            Yapping
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
            <div className="flex items-center" style={{ gap: 4 }}>
              <button
                onClick={onStartConversation}
                className="flex items-center gap-1.5 transition-all duration-200 hover:opacity-80"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--yapper-accent)",
                  background: "var(--yapper-surface-low, var(--yapper-bg-light))",
                  border: "1px solid var(--yapper-accent)",
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: 8,
                  opacity: 0.9,
                }}
              >
                <MessageCircle style={{ width: 12, height: 12 }} />
                <span>Yapp</span>
              </button>
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
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
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
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
