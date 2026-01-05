import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef } from "react";
import { Mic, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
// Don't import shared styles — they add borders/backgrounds that break transparency

type WidgetState = "idle" | "listening" | "processing";

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const dragStartPos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const mouseDownTime = useRef(0);

  useEffect(() => {
    const unlistenState = listen<string>("stt-state-changed", (event) => {
      console.log("[WIDGET] stt-state-changed:", event.payload);
      setState(event.payload as WidgetState);
    });
    const unlistenTheme = listen<string>("theme-changed", (event) => {
      const root = document.documentElement;
      if (event.payload === "dark") {
        root.style.setProperty("--claude-orange", "#E89B7D");
        root.style.setProperty("--claude-orange-dark", "#CC785C");
        root.style.setProperty("--claude-bg-lighter", "#2A2A2A");
        root.style.setProperty("--claude-text-secondary", "#A3A3A3");
        root.style.setProperty("--claude-border", "#333333");
      } else {
        root.style.setProperty("--claude-orange", "#CC785C");
        root.style.setProperty("--claude-orange-dark", "#B85C3D");
        root.style.setProperty("--claude-bg-lighter", "#FAFAFA");
        root.style.setProperty("--claude-text-secondary", "#666666");
        root.style.setProperty("--claude-border", "#E5E5E5");
      }
    });
    return () => {
      unlistenState.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartPos.current = { x: e.screenX, y: e.screenY };
    mouseDownTime.current = Date.now();
    didDrag.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (mouseDownTime.current === 0) return;
    const dx = Math.abs(e.screenX - dragStartPos.current.x);
    const dy = Math.abs(e.screenY - dragStartPos.current.y);
    // If moved more than 5px, start dragging
    if (!didDrag.current && (dx > 5 || dy > 5)) {
      didDrag.current = true;
      getCurrentWindow().startDragging();
    }
  };

  const handlePointerUp = async () => {
    const elapsed = Date.now() - mouseDownTime.current;
    mouseDownTime.current = 0;

    // If it was a short press without dragging, treat as click
    if (!didDrag.current && elapsed < 500) {
      if (state === "idle") {
        await invoke("start_recording");
      } else if (state === "listening") {
        await invoke("stop_recording");
      }
    }
    didDrag.current = false;
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        overflow: "visible",
      }}
    >
      <motion.button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        disabled={state === "processing"}
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: state === "idle" ? "1px solid var(--claude-border)" : "none",
          outline: "none",
          cursor: state === "processing" ? "wait" : "grab",
          background:
            state === "idle"
              ? "var(--claude-bg-lighter)"
              : state === "listening"
              ? "var(--claude-orange)"
              : "var(--claude-orange-dark)",
          boxShadow: state === "idle" ? "none" : undefined,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={
          state === "listening"
            ? {
                boxShadow: [
                  "0 0 0 0 rgba(232, 155, 125, 0.7)",
                  "0 0 0 16px rgba(232, 155, 125, 0)",
                ],
              }
            : { boxShadow: "0 0 0 0 rgba(0, 0, 0, 0)" }
        }
        transition={
          state === "listening"
            ? {
                boxShadow: {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }
            : { boxShadow: { duration: 0.2 } }
        }
      >
        {state === "idle" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Mic style={{ width: 24, height: 24, color: "var(--claude-text-secondary)" }} />
          </motion.div>
        )}

        {state === "listening" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ position: "relative" }}
          >
            <Mic style={{ width: 24, height: 24, color: "white" }} />
            <div
              style={{
                position: "absolute",
                bottom: -4,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 2,
              }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  style={{
                    width: 2,
                    backgroundColor: "white",
                    borderRadius: 9999,
                  }}
                  animate={{ height: ["4px", "12px", "4px"] }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {state === "processing" && (
          <motion.div
            initial={{ opacity: 0, rotate: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            transition={{
              rotate: { duration: 2, repeat: Infinity, ease: "linear" },
            }}
          >
            <Sparkles style={{ width: 24, height: 24, color: "white" }} />
          </motion.div>
        )}
      </motion.button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
