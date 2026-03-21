import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef } from "react";
import { Mic, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type WidgetState = "idle" | "listening" | "processing";

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");
  const mouseDownTime = useRef(0);

  useEffect(() => {
    const unlistenState = listen<string>("stt-state-changed", (event) => {
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

  const handlePointerDown = () => {
    mouseDownTime.current = Date.now();
  };

  const handlePointerUp = async () => {
    const elapsed = Date.now() - mouseDownTime.current;
    mouseDownTime.current = 0;
    if (elapsed < 400) {
      if (state === "idle") {
        await invoke("start_recording");
      } else if (state === "listening") {
        await invoke("stop_recording");
      }
    }
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
      }}
    >
      {/* Always render the full circle — window resize handles collapse/expand */}
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: state === "processing" ? "wait" : "pointer",
          background:
            state === "idle"
              ? "var(--claude-bg-lighter)"
              : state === "listening"
              ? "var(--claude-orange)"
              : "var(--claude-orange-dark)",
          border: state === "idle" ? "1px solid var(--claude-border)" : "none",
        }}
      >
        {state === "idle" && (
          <Mic style={{ width: 24, height: 24, color: "var(--claude-text-secondary)" }} />
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
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
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
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
