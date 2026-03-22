import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Mic, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type WidgetState = "idle" | "listening" | "processing";

const EXPANDED_SIZE = 64;
const COLLAPSED_WIDTH = 48;
const COLLAPSED_HEIGHT = 6;

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = isHovered || state !== "idle";

  // Listen for global hover from Rust polling (works when app is inactive)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsHovered(detail === true);
    };
    window.addEventListener("yapper-hover", handler);
    return () => window.removeEventListener("yapper-hover", handler);
  }, []);

  useEffect(() => {
    const unlistenState = listen<string>("stt-state-changed", (event) => {
      setState(event.payload as WidgetState);
    });
    const unlistenTheme = listen<string>("theme-changed", (event) => {
      const root = document.documentElement;
      if (event.payload === "dark") {
        root.style.setProperty("--yapper-accent", "#ffb59e");
        root.style.setProperty("--yapper-accent-dark", "#ae3200");
        root.style.setProperty("--yapper-bg-lighter", "#191c1d");
        root.style.setProperty("--yapper-text-secondary", "#c6c6c6");
        root.style.setProperty("--yapper-border", "#474747");
      } else {
        root.style.setProperty("--yapper-accent", "#ae3200");
        root.style.setProperty("--yapper-accent-dark", "#852400");
        root.style.setProperty("--yapper-bg-lighter", "#f8f9fa");
        root.style.setProperty("--yapper-text-secondary", "#474747");
        root.style.setProperty("--yapper-border", "#c6c6c6");
      }
    });
    return () => {
      unlistenState.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
    };
  }, []);

  const handleClick = async () => {
    if (state === "idle") {
      await invoke("start_recording");
    } else if (state === "listening") {
      await invoke("stop_recording");
    }
  };

  // Use mousedown to fire immediately on first click,
  // even when the app isn't focused (bypasses activation delay)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleClick();
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: 4,
        background: "transparent",
      }}
    >
      {/* Animated container — morphs between pill and circle */}
      <motion.div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={handleMouseDown}
        animate={{
          width: isExpanded ? EXPANDED_SIZE : COLLAPSED_WIDTH,
          height: isExpanded ? EXPANDED_SIZE : COLLAPSED_HEIGHT,
          borderRadius: isExpanded ? EXPANDED_SIZE / 2 : COLLAPSED_HEIGHT / 2,
          opacity: isExpanded ? 1 : 0.4,
        }}
        whileHover={isExpanded ? { scale: 1.08 } : undefined}
        whileTap={isExpanded ? { scale: 0.94 } : undefined}
        transition={{
          duration: 0.2,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: state === "processing" ? "wait" : "pointer",
          background:
            state === "idle"
              ? "var(--yapper-bg-lighter)"
              : state === "listening"
              ? "var(--yapper-accent)"
              : "var(--yapper-accent-dark)",
          border: state === "idle" ? "1px solid var(--yapper-border)" : "none",
          overflow: "hidden",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Content — fades in/out with expand */}
        <motion.div
          animate={{
            opacity: isExpanded ? 1 : 0,
            scale: isExpanded ? 1 : 0.5,
          }}
          transition={{ duration: 0.15 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {state === "idle" && (
            <Mic style={{ width: 24, height: 24, color: "var(--yapper-text-secondary)" }} />
          )}

          {state === "listening" && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                    style={{ width: 2, backgroundColor: "white", borderRadius: 9999 }}
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
            </div>
          )}

          {state === "processing" && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles style={{ width: 24, height: 24, color: "white" }} />
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* Pulse glow ring — only when listening and expanded */}
      {state === "listening" && isExpanded && (
        <motion.div
          style={{
            position: "absolute",
            width: EXPANDED_SIZE,
            height: EXPANDED_SIZE,
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 1,
          }}
          animate={{
            boxShadow: [
              "0 0 0 0 rgba(174, 50, 0, 0.5)",
              "0 0 0 18px rgba(174, 50, 0, 0)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
