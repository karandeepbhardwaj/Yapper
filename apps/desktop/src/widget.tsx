import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Mic } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type WidgetState = "idle" | "listening" | "processing" | "conversation";

// Pill sizes for each state
const COLLAPSED_W = 60;
const COLLAPSED_H = 8;
const HOVER_W = 64;
const HOVER_H = 48;
const RECORDING_W = 200;
const RECORDING_H = 62;

const PILL_EASE = [0.34, 1.1, 0.64, 1] as const;

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const [isHovered, setIsHovered] = useState(false);
  const [hotkey, setHotkey] = useState("fn");
  const [convoHotkey, setConvoHotkey] = useState("Cmd+Shift+Y");
  const [actionLabel, setActionLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [partialText, setPartialText] = useState<string>("");

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isConversation = state === "conversation";
  const isActive = isListening || isProcessing || isConversation;

  // Rust-polled hover
  useEffect(() => {
    const handler = (e: Event) => {
      setIsHovered((e as CustomEvent).detail === true);
    };
    window.addEventListener("yapper-hover", handler);
    return () => window.removeEventListener("yapper-hover", handler);
  }, []);

  useEffect(() => {
    const unsub = listen<string>("stt-state-changed", (event) => {
      setState(event.payload as WidgetState);
      if (event.payload === "listening") {
        setErrorMessage(null);
      }
      if (event.payload !== "listening") {
        setPartialText("");
      }
    });
    const unlistenPartial = listen<{ text: string; is_final: boolean }>(
      "stt-partial",
      (event) => {
        setPartialText(event.payload.text);
      }
    );
    const unsubAction = listen<{action?: string}>("refinement-complete", (event) => {
      const action = event.payload?.action;
      if (action && action !== "dictation") {
        const labels: Record<string, string> = {
          translate: "Translating",
          summarize: "Summarizing",
          draft: "Drafting",
          explain: "Explaining",
          chain: "Processing",
          unknown: "Processing",
        };
        setActionLabel(labels[action] || "Processing");
        setTimeout(() => setActionLabel(null), 2000);
      }
    });
    const unsubSkipped = listen<{reason: string}>("refinement-skipped", (event) => {
      setErrorMessage(event.payload?.reason || "AI unavailable");
      setTimeout(() => setErrorMessage(null), 4000);
    });
    return () => {
      unsub.then((fn) => fn());
      unlistenPartial.then((fn) => fn());
      unsubAction.then((fn) => fn());
      unsubSkipped.then((fn) => fn());
    };
  }, []);

  const handlePillClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Only left click (button 0) triggers recording
    if (e.button !== 0) return;
    if (!isActive) {
      await invoke("start_recording");
    }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("stop_recording");
  };

  // Load hotkey from settings + listen for changes
  useEffect(() => {
    invoke<{ hotkey: string; conversation_hotkey: string }>("get_settings").then((s) => {
      if (s?.hotkey) setHotkey(s.hotkey);
      if (s?.conversation_hotkey) setConvoHotkey(s.conversation_hotkey);
    }).catch((e) => console.error("Failed to load settings:", e));

    const unsub = listen<string>("hotkey-changed", (event) => {
      if (event.payload) setHotkey(event.payload);
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

  const formatHotkey = (hk: string): string => {
    if (hk.toLowerCase() === "fn") return "fn";
    return hk
      .replace(/Cmd\+/gi, "\u2318")
      .replace(/Shift\+/gi, "\u21e7")
      .replace(/Alt\+/gi, "\u2325")
      .replace(/Ctrl\+/gi, "\u2303")
      .replace(/Meta\+/gi, "\u2318");
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Just reset UI state — no refinement, no paste, no save
    setState("idle");
    // Reset backend STT state without triggering the pipeline
    invoke("cancel_recording").catch((e) => console.error("Failed to cancel recording:", e));
  };

  // Determine pill dimensions
  const pillW = isConversation ? HOVER_W : (isListening || isProcessing) ? RECORDING_W : isHovered ? HOVER_W : COLLAPSED_W;
  const pillH = isConversation ? HOVER_H : (isListening || isProcessing) ? RECORDING_H : isHovered ? HOVER_H : COLLAPSED_H;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 4,
        background: "transparent",
        pointerEvents: "none",
      }}
    >
      {/* Tooltip — error message or hover hint */}
      <AnimatePresence>
        {errorMessage && !isActive ? (
          <motion.div
            key="error-tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              marginBottom: 8,
              padding: "10px 20px",
              borderRadius: 16,
              background: "#2a231d",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.4,
              letterSpacing: "0.01em",
              color: "rgba(255,255,255,0.7)",
              textAlign: "center",
              maxWidth: 200,
              pointerEvents: "auto",
            }}
          >
            {errorMessage}
          </motion.div>
        ) : isHovered && !isActive ? (
          <motion.div
            key="hover-tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              marginBottom: 8,
              padding: "10px 20px",
              borderRadius: 24,
              background: "#2a231d",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              fontSize: 15,
              fontWeight: 400,
              letterSpacing: "0.01em",
              color: "rgba(255,255,255,0.7)",
              whiteSpace: "nowrap",
              pointerEvents: "auto",
            }}
          >
            press <span style={{ color: "#DA7756", fontWeight: 700 }}>{formatHotkey(hotkey)}</span> to yapp
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Pill */}
      <motion.div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={!isActive ? handlePillClick : undefined}
        animate={{
          width: pillW,
          height: pillH,
          borderRadius: pillH / 2,
          opacity: !isActive && !isHovered ? 0.5 : 1,
        }}
        transition={{
          duration: 0.35,
          ease: PILL_EASE,
          opacity: { duration: 0.2 },
        }}
        style={{
          background: "#1c1713",
          border: "1.5px solid rgba(218, 119, 86, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isActive ? "default" : "pointer",
          overflow: "hidden",
          position: "relative",
          pointerEvents: "auto",
        }}
      >
        <AnimatePresence mode="popLayout">
          {!isActive && isHovered && !errorMessage && (
            <motion.div
              key="hover"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Mic style={{ width: 22, height: 22, color: "#DA7756" }} />
            </motion.div>
          )}
          {isListening && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
              }}
            >
              {/* Wave background — full pill width, behind buttons */}
              <div style={{ position: "absolute", inset: 0 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={`wave-${i}`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `linear-gradient(90deg,
                        transparent 0%,
                        rgba(218,119,86,${[0.35, 0.2, 0.15][i]}) 25%,
                        rgba(245,201,168,${[0.25, 0.15, 0.1][i]}) 50%,
                        rgba(218,119,86,${[0.35, 0.2, 0.15][i]}) 75%,
                        transparent 100%
                      )`,
                      backgroundSize: "200% 100%",
                      animation: `waveFlow ${[2.5, 3.5, 4.5][i]}s ease-in-out infinite`,
                      animationDelay: `${[0, -1.2, -2.4][i]}s`,
                    }}
                  />
                ))}
                {/* Sparkle particles riding the waves */}
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={`sp-${i}`}
                    style={{
                      position: "absolute",
                      width: i % 2 === 0 ? 2.5 : 1.5,
                      height: i % 2 === 0 ? 2.5 : 1.5,
                      borderRadius: "50%",
                      background: "#fff",
                      top: `${25 + Math.sin(i * 1.3) * 25}%`,
                      pointerEvents: "none",
                      animation: `sparkleFlow ${1.8 + i * 0.3}s ease-in-out infinite`,
                      animationDelay: `${i * 0.35}s`,
                      opacity: 0,
                    }}
                  />
                ))}
              </div>

              {/* Buttons — floating on top of aurora */}
              <div style={{
                position: "relative", zIndex: 2,
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", padding: "0 6px",
              }}>
                {/* Discard (X) button */}
                <motion.button
                  onClick={handleDiscard}
                  aria-label="Cancel recording"
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.85 }}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    background: "rgba(0,0,0,0.35)",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, color: "rgba(255,255,255,0.45)",
                    fontSize: 14, fontWeight: 400, lineHeight: 1,
                  }}
                >
                  ✕
                </motion.button>
                <div style={{ flex: 1 }} />
                {/* Stop button */}
                <motion.button
                  onClick={handleStop}
                  aria-label="Stop recording"
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.85 }}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    background: "#DA7756", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: "#fff" }} />
                </motion.button>
              </div>
              {/* Live transcript text */}
              {partialText && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: 12,
                    right: 48,
                    fontSize: 10,
                    color: "var(--yapper-text-secondary, #aaa)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    direction: "rtl",
                    textAlign: "left",
                    pointerEvents: "none",
                    fontStyle: "italic",
                  }}
                >
                  <span style={{ unicodeBidi: "plaintext" }}>
                    {partialText.length > 50 ? "..." + partialText.slice(-50) : partialText}
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "inherit",
                overflow: "hidden",
                position: "relative",
                pointerEvents: "auto",
              }}
            >
              {/* Animated hue wave */}
              <motion.div
                animate={{
                  backgroundPosition: ["0% 50%", "200% 50%"],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "inherit",
                  background: "linear-gradient(90deg, #1c1713, #DA7756, #e8a87c, #f5c9a8, #e8a87c, #DA7756, #1c1713)",
                  backgroundSize: "200% 100%",
                }}
              />
              {/* Sparkle particles */}
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={`sparkle-${i}`}
                  style={{
                    position: "absolute",
                    width: i % 3 === 0 ? 3 : 2,
                    height: i % 3 === 0 ? 3 : 2,
                    borderRadius: "50%",
                    background: "#fff",
                    top: `${20 + Math.sin(i * 1.2) * 30}%`,
                    left: `${8 + i * 11}%`,
                  }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0.3, 1, 0.3],
                    y: [0, -3, 0],
                  }}
                  transition={{
                    duration: 1.2 + (i % 3) * 0.4,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                />
              ))}
              {/* Action label overlay + cancel button */}
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2,
              }}>
                {actionLabel && (
                  <span
                    style={{
                      color: "white",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase" as const,
                      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                      position: "relative",
                      zIndex: 3,
                    }}
                  >
                    {actionLabel}...
                  </span>
                )}
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => invoke("cancel_screen_capture")}
                  style={{
                    position: "absolute",
                    right: 8,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(255,255,255,0.2)",
                    color: "white",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 4,
                    pointerEvents: "auto",
                  }}
                  title="Cancel"
                >
                  ✕
                </motion.button>
              </div>
            </motion.div>
          )}
          {isConversation && (
            <motion.div
              key="conversation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Pulsing accent dot */}
              <motion.div
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#DA7756",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <style>{`
        @keyframes waveFlow {
          0% { background-position: 200% 50%; }
          100% { background-position: -200% 50%; }
        }
        @keyframes sparkleFlow {
          0% { left: 5%; opacity: 0; transform: scale(0.3); }
          20% { opacity: 0.8; transform: scale(1); }
          80% { opacity: 0.6; transform: scale(0.8); }
          100% { left: 90%; opacity: 0; transform: scale(0.2); }
        }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
