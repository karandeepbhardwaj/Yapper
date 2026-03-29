import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Mic } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type WidgetState = "idle" | "listening" | "processing" | "conversation";

// Pill sizes for each state
const COLLAPSED_W = 50;
const COLLAPSED_H = 7;
const HOVER_W = 52;
const HOVER_H = 24;
const RECORDING_W = 160;
const RECORDING_H = 32;

const PILL_EASE = [0.34, 1.1, 0.64, 1] as const;

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const [isHovered, setIsHovered] = useState(false);
  const [hotkey, setHotkey] = useState("fn");
  const [convoHotkey, setConvoHotkey] = useState("Cmd+Shift+Y");

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
    });
    return () => { unsub.then((fn) => fn()); };
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
      {/* Tooltip on hover (idle only) */}
      <AnimatePresence>
        {isHovered && !isActive && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              marginBottom: 6,
              padding: "6px 12px",
              borderRadius: 10,
              background: "#2a231d",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              fontSize: 11,
              color: "rgba(255,255,255,0.75)",
              whiteSpace: "nowrap",
              pointerEvents: "auto",
            }}
          >
            <span style={{ color: "#DA7756", fontWeight: 600 }}>{formatHotkey(hotkey)}</span> to dictate
            {" · "}
            <span style={{ color: "#DA7756", fontWeight: 600 }}>{formatHotkey(convoHotkey)}</span> to yapp
          </motion.div>
        )}
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
        <AnimatePresence mode="wait">
          {!isActive && isHovered && (
            <motion.div
              key="hover"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Mic style={{ width: 14, height: 14, color: "#DA7756" }} />
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
                display: "flex",
                alignItems: "center",
                padding: "0 6px",
              }}
            >
              {/* Discard (X) button */}
              <motion.button
                onClick={handleDiscard}
                aria-label="Cancel recording"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: 1,
                  zIndex: 2,
                }}
              >
                ✕
              </motion.button>

              {/* Aurora waveform center */}
              <div style={{
                flex: 1,
                height: "100%",
                position: "relative",
                overflow: "hidden",
                margin: "0 4px",
              }}>
                {/* Ambient glow pulse */}
                <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "radial-gradient(ellipse at center, rgba(218,119,86,0.15) 0%, transparent 70%)",
                  }}
                />

                {/* Flowing aurora ribbons using CSS animation for smoothness */}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={`ribbon-${i}`}
                      style={{
                        position: "absolute",
                        width: "120%",
                        height: [14, 10, 18, 8, 12][i],
                        left: "-10%",
                        top: `${28 + [0, 8, -4, 12, 4][i]}%`,
                        background: `linear-gradient(90deg,
                          transparent 0%,
                          rgba(218,119,86,${[0.4, 0.2, 0.35, 0.15, 0.25][i]}) 20%,
                          rgba(245,201,168,${[0.5, 0.3, 0.4, 0.2, 0.35][i]}) 40%,
                          rgba(218,119,86,${[0.45, 0.25, 0.5, 0.2, 0.3][i]}) 60%,
                          rgba(232,168,124,${[0.3, 0.15, 0.25, 0.1, 0.2][i]}) 80%,
                          transparent 100%
                        )`,
                        borderRadius: "50%",
                        filter: `blur(${[3, 5, 2, 6, 4][i]}px)`,
                        animation: `auroraRibbon${i} ${[3, 4.5, 2.5, 5, 3.5][i]}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                </div>

                {/* Sparkle particles */}
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={`sp-${i}`}
                    style={{
                      position: "absolute",
                      width: i % 2 === 0 ? 2.5 : 1.5,
                      height: i % 2 === 0 ? 2.5 : 1.5,
                      borderRadius: "50%",
                      background: "#fff",
                      top: `${20 + Math.sin(i * 1.1) * 30}%`,
                      left: `${8 + i * 16}%`,
                      pointerEvents: "none",
                    }}
                    animate={{
                      opacity: [0, 0.8, 0],
                      scale: [0.2, 1, 0.2],
                    }}
                    transition={{
                      duration: 1.5 + (i % 3) * 0.5,
                      repeat: Infinity,
                      delay: i * 0.4,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>

              {/* Stop button */}
              <motion.button
                onClick={handleStop}
                aria-label="Stop recording"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "#DA7756",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  zIndex: 2,
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: 1.5, background: "#fff" }} />
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
        @keyframes auroraRibbon0 {
          0%, 100% { transform: translateX(0%) scaleY(1); opacity: 0.7; }
          25% { transform: translateX(8%) scaleY(1.3); opacity: 1; }
          50% { transform: translateX(-5%) scaleY(0.8); opacity: 0.6; }
          75% { transform: translateX(10%) scaleY(1.1); opacity: 0.9; }
        }
        @keyframes auroraRibbon1 {
          0%, 100% { transform: translateX(5%) scaleY(1); opacity: 0.5; }
          30% { transform: translateX(-8%) scaleY(1.4); opacity: 0.8; }
          60% { transform: translateX(12%) scaleY(0.7); opacity: 0.4; }
        }
        @keyframes auroraRibbon2 {
          0%, 100% { transform: translateX(-3%) scaleY(1.1); opacity: 0.8; }
          35% { transform: translateX(10%) scaleY(0.6); opacity: 0.5; }
          65% { transform: translateX(-7%) scaleY(1.5); opacity: 1; }
        }
        @keyframes auroraRibbon3 {
          0%, 100% { transform: translateX(6%) scaleY(0.9); opacity: 0.4; }
          40% { transform: translateX(-10%) scaleY(1.3); opacity: 0.7; }
          70% { transform: translateX(4%) scaleY(0.8); opacity: 0.3; }
        }
        @keyframes auroraRibbon4 {
          0%, 100% { transform: translateX(-4%) scaleY(1); opacity: 0.6; }
          30% { transform: translateX(7%) scaleY(1.2); opacity: 0.9; }
          55% { transform: translateX(-6%) scaleY(0.7); opacity: 0.4; }
          80% { transform: translateX(9%) scaleY(1.4); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
