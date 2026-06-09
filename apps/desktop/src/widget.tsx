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
const RECORDING_W = 210;
const RECORDING_H = 46;

const PILL_EASE = [0.34, 1.1, 0.64, 1] as const;

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const [isHovered, setIsHovered] = useState(false);
  const [hotkey, setHotkey] = useState("fn");
  const [convoHotkey, setConvoHotkey] = useState("Cmd+Shift+Y");
  const [actionLabel, setActionLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    });
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
      {/* Tooltip — speaking label, error message, or hover hint */}
      <AnimatePresence>
        {isListening ? (
          <motion.div
            key="speaking-label"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              marginBottom: 9,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: "rgba(255,255,255,0.9)",
              textShadow: "0 1px 5px rgba(0,0,0,0.45)",
              pointerEvents: "none",
            }}
          >
            Speaking…
          </motion.div>
        ) : errorMessage && !isActive ? (
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
                width: "100%", height: "100%",
                display: "flex", alignItems: "center",
                padding: "0 7px", gap: 8,
              }}
            >
              {/* Cancel (X) */}
              <motion.button
                onClick={handleDiscard}
                aria-label="Cancel recording"
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.85 }}
                style={{
                  width: 30, height: 30, borderRadius: 15,
                  background: "rgba(255,255,255,0.08)",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, color: "rgba(255,255,255,0.5)",
                  fontSize: 13, lineHeight: 1,
                }}
              >
                ✕
              </motion.button>

              {/* Live audio equalizer — contained inset waveform */}
              <div style={{
                flex: 1, height: 26, borderRadius: 13,
                background: "rgba(0,0,0,0.28)",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 3, overflow: "hidden",
              }}>
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={`bar-${i}`}
                    style={{
                      width: 2.5, borderRadius: 2,
                      background: "linear-gradient(180deg, #f5c9a8, #DA7756)",
                      animation: `eq ${0.7 + (i % 5) * 0.13}s ease-in-out ${(i % 7) * 0.07}s infinite alternate`,
                    }}
                  />
                ))}
              </div>

              {/* Stop */}
              <motion.button
                onClick={handleStop}
                aria-label="Stop recording"
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.85 }}
                style={{
                  width: 30, height: 30, borderRadius: 15,
                  background: "#DA7756", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(218,119,86,0.5)",
                }}
              >
                <div style={{ width: 9, height: 9, borderRadius: 2, background: "#fff" }} />
              </motion.button>
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
        @keyframes eq {
          0%   { height: 4px;  opacity: 0.55; }
          100% { height: 18px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
