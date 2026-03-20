import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { FloatingWidget } from "./app/components/FloatingWidget";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./styles/index.css";

type WidgetState = "idle" | "listening" | "processing";

function WidgetApp() {
  const [state, setState] = useState<WidgetState>("idle");

  useEffect(() => {
    const unlisten = listen<string>("stt-state-changed", (event) => {
      setState(event.payload as WidgetState);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleStateChange = async (newState: WidgetState) => {
    if (newState === "listening") {
      await invoke("start_recording");
    } else if (newState === "idle") {
      await invoke("stop_recording");
    }
  };

  return (
    <div style={{ background: "transparent" }}>
      <FloatingWidget state={state} onStateChange={handleStateChange} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<WidgetApp />);
