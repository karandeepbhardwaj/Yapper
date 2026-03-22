import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Mic } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type WidgetState = "idle" | "listening" | "processing";

// Pill sizes for each state
const COLLAPSED_W = 40;
const COLLAPSED_H = 5;
const HOVER_W = 52;
const HOVER_H = 24;
const RECORDING_W = 160;
const RECORDING_H = 32;

const PILL_EASE = [0.34, 1.1, 0.64, 1] as const;

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const [isHovered, setIsHovered] = useState(false);

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isActive = isListening || isProcessing;

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
    if (!isActive) {
      await invoke("start_recording");
    }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("stop_recording");
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Just reset UI state — no refinement, no paste, no save
    setState("idle");
    // Reset backend STT state without triggering the pipeline
    invoke("cancel_recording").catch(() => {});
  };

  // Determine pill dimensions
  const pillW = isActive ? RECORDING_W : isHovered ? HOVER_W : COLLAPSED_W;
  const pillH = isActive ? RECORDING_H : isHovered ? HOVER_H : COLLAPSED_H;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
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
          background: "#1a1a1a",
          border: "1.5px solid #3a3a3a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isActive ? "default" : "pointer",
          overflow: "hidden",
          position: "relative",
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
              <Mic style={{ width: 14, height: 14, color: "#ae3200" }} />
            </motion.div>
          )}
          {isListening && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.12 }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "0 6px",
              }}
            >
              {/* Discard (X) button */}
              <motion.button
                onClick={handleDiscard}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "#3a3a3a",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#aaa",
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: 1,
                }}
              >
                ✕
              </motion.button>

              {/* Wave bars */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2.5 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.div
                    key={i}
                    style={{
                      width: 2.5,
                      borderRadius: 1.5,
                      background: "#e5383b",
                    }}
                    animate={{
                      height: [3, 8 + Math.sin(i * 0.7) * 6, 3],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 0.6 + Math.random() * 0.3,
                      repeat: Infinity,
                      delay: i * 0.05,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>

              {/* Stop (send for refinement) button */}
              <motion.button
                onClick={handleStop}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "#e5383b",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 1.5,
                    background: "#fff",
                  }}
                />
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
                  background: "linear-gradient(90deg, #1a1a1a, #4a6cf7, #9b59b6, #e74c3c, #f39c12, #4a6cf7, #1a1a1a)",
                  backgroundSize: "200% 100%",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
