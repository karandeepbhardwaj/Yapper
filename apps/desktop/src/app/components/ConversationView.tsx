import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Copy, Check, RotateCcw, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConversationSummary } from "../lib/types";
import { FONT_SIZE, BORDER_RADIUS, ANIMATION } from "../lib/tokens";

const isMac = navigator.platform.toUpperCase().includes("MAC");

function AiCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(text).catch((e) => console.error("Failed to copy to clipboard:", e));
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 800);
  };

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy to clipboard"
      title="Copy"
      className={copied ? "" : "copy-btn-hover"}
      style={{
        display: "flex",
        alignItems: "center",
        padding: 3,
        background: "none",
        border: "none",
        cursor: "pointer",
        borderRadius: 4,
        color: "var(--yapper-text-secondary)",
        opacity: copied ? 1 : undefined,
        transition: "opacity 0.15s",
      }}
    >
      {copied
        ? <Check style={{ width: 12, height: 12, color: "var(--yapper-accent)" }} />
        : <Copy style={{ width: 12, height: 12 }} />
      }
    </button>
  );
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ConversationViewProps {
  onBack: () => void;
  onConversationEnded: () => void;
  hotkey: string;
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

/* Extracted sub-components (Finding #14) */

function RecordingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: "flex", justifyContent: "flex-end" }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderRadius: `${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px 4px ${BORDER_RADIUS.lg}px`,
          background: "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: 0.85,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              style={{
                width: 2,
                borderRadius: 1,
                background: "#fff",
              }}
              animate={{
                height: [3, 8 + Math.sin(i * 0.8) * 5, 3],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: ANIMATION.slow + Math.random() * 0.3,
                repeat: Infinity,
                delay: i * 0.08,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: FONT_SIZE.sm, color: "#fff" }}>Listening...</span>
      </div>
    </motion.div>
  );
}

function ProcessingIndicator({ streamingContent }: { streamingContent: string }) {
  if (streamingContent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", justifyContent: "flex-start" }}
      >
        <div
          style={{
            maxWidth: "80%",
            padding: "10px 14px",
            borderRadius: `${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px 4px`,
            background: "var(--yapper-surface-lowest, #fff)",
            boxShadow: "var(--yapper-card-shadow)",
            border: "1px solid var(--yapper-border)",
            color: "var(--foreground)",
            fontSize: FONT_SIZE.base,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {streamingContent}
          <span style={{ opacity: 0.4, animation: "blink 1s infinite" }}>|</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: "flex", justifyContent: "flex-start" }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderRadius: `${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px 4px`,
          background: "var(--yapper-surface-lowest, #fff)",
          boxShadow: "var(--yapper-card-shadow)",
          border: "1px solid var(--yapper-border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Loader2
          style={{
            width: 14,
            height: 14,
            color: "var(--yapper-accent)",
            animation: "spin 1s linear infinite",
          }}
        />
        <span style={{ fontSize: FONT_SIZE.sm, color: "var(--yapper-text-secondary)" }}>
          Thinking...
        </span>
      </div>
    </motion.div>
  );
}

function ConversationControls({
  onCancel,
  onRefresh,
  onEnd,
  isEnding,
  hasTurns,
  recordingSeconds,
}: {
  onCancel: () => void;
  onRefresh: () => void;
  onEnd: () => void;
  isEnding: boolean;
  hasTurns: boolean;
  recordingSeconds: number;
}) {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        margin: "8px 20px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      {/* Left: Cancel */}
      <button
        onClick={onCancel}
        aria-label="Cancel recording"
        style={{
          background: "var(--yapper-surface-lowest)",
          boxShadow: "var(--yapper-card-shadow)",
          border: "1px solid var(--yapper-border)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "7px 12px",
          borderRadius: 10,
          color: "var(--yapper-text-secondary)",
          fontSize: FONT_SIZE.xs,
          fontWeight: 500,
        }}
      >
        <X style={{ width: 11, height: 11 }} />
        Cancel
      </button>

      {/* Center: Timer + Refresh */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontSize: FONT_SIZE.xs,
            fontWeight: 500,
            color: "var(--yapper-text-secondary)",
            fontVariantNumeric: "tabular-nums",
            opacity: 0.6,
          }}
        >
          {formatTime(recordingSeconds)}
        </span>

        <button
          onClick={onRefresh}
          disabled={isEnding || !hasTurns}
          aria-label="New conversation"
          title="New conversation"
          style={{
            background: "var(--yapper-surface-lowest)",
            boxShadow: "var(--yapper-card-shadow)",
            border: "1px solid var(--yapper-border)",
            cursor: !hasTurns ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 6,
            borderRadius: BORDER_RADIUS.sm,
            color: "var(--yapper-text-secondary)",
            opacity: !hasTurns ? 0.3 : 0.7,
          }}
        >
          <RotateCcw style={{ width: 11, height: 11 }} />
        </button>
      </div>

      {/* Right: End */}
      <button
        onClick={onEnd}
        disabled={isEnding || !hasTurns}
        aria-label="End conversation"
        style={{
          fontSize: FONT_SIZE.xs,
          fontWeight: 600,
          padding: "7px 14px",
          borderRadius: 10,
          color: !hasTurns ? "var(--yapper-text-secondary)" : "#fff",
          background: !hasTurns ? "var(--yapper-surface-lowest)" : "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)",
          boxShadow: hasTurns
            ? "0 2px 8px rgba(218,119,86,0.3), inset 0 1px 1px rgba(255,255,255,0.15)"
            : "var(--yapper-card-shadow)",
          border: hasTurns ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--yapper-border)",
          cursor: !hasTurns ? "default" : "pointer",
          opacity: isEnding ? 0.5 : !hasTurns ? 0.4 : 1,
        }}
      >
        {isEnding ? "Saving..." : "End"}
      </button>
    </div>
  );
}

export function ConversationView({
  onBack,
  onConversationEnded,
  hotkey,
}: ConversationViewProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start conversation session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await invoke<string>("start_conversation");
        if (!cancelled) {
          setSessionId(id);
        }
      } catch (e) {
        console.error("[Conversation] Failed to start session:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for raw transcript from widget/hotkey recording
  useEffect(() => {
    const unlisten = listen<string>("conversation-raw-transcript", async (event) => {
      const text = event.payload?.trim();
      if (!text) return;

      setError(null);

      // Add user turn immediately
      setTurns((prev) => [
        ...prev,
        { role: "user", content: text, timestamp: new Date().toISOString() },
      ]);

      // Send to AI
      setIsProcessing(true);
      setStreamingContent("");

      try {
        const aiResponse = await invoke<string>("send_conversation_turn", {
          userText: text,
        });

        setTurns((prev) => [
          ...prev,
          { role: "assistant", content: aiResponse, timestamp: new Date().toISOString() },
        ]);
        setStreamingContent("");
      } catch (e) {
        const errMsg = typeof e === "string" ? e : (e as Error)?.message || "Unknown error";
        console.error("[Conversation] AI turn failed:", errMsg);
        setError(errMsg);
      } finally {
        setIsProcessing(false);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for AI streaming chunks
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; content: string }>(
      "conversation-ai-chunk",
      (event) => {
        setStreamingContent((prev) => prev + event.payload.content);
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for STT state to show recording indicator
  useEffect(() => {
    const unlisten = listen<string>("stt-state-changed", (event) => {
      setIsRecording(event.payload === "listening");
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Recording time -- only ticks while recording
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, streamingContent]);

  const cancelConversation = useCallback(async () => {
    if (isRecording) {
      try { await invoke("cancel_recording"); } catch (e) { console.error("Failed to cancel recording:", e); }
      setIsRecording(false);
    }
    // Discard without saving
    try { await invoke("discard_conversation"); } catch (e) { console.error("Failed to discard conversation:", e); }
    onBack();
  }, [isRecording, onBack]);

  const refreshConversation = useCallback(async () => {
    if (isRecording) {
      try { await invoke("cancel_recording"); } catch (e) { console.error("Failed to cancel recording:", e); }
      setIsRecording(false);
    }
    // Discard current session without saving, start fresh
    try { await invoke("discard_conversation"); } catch (e) { console.error("Failed to discard conversation:", e); }
    setTurns([]);
    setStreamingContent("");
    setError(null);
    setRecordingSeconds(0);
    setIsProcessing(false);
    setIsEnding(false);
    try {
      const id = await invoke<string>("start_conversation");
      setSessionId(id);
    } catch (e) {
      console.error("[Conversation] Failed to restart session:", e);
    }
  }, [isRecording]);

  const endConversation = useCallback(async () => {
    if (isRecording) {
      try { await invoke("cancel_recording"); } catch (e) { console.error("Failed to cancel recording:", e); }
      setIsRecording(false);
    }

    setIsEnding(true);
    try {
      await invoke<ConversationSummary>("end_conversation");
      onConversationEnded();
    } catch (e) {
      console.error("[Conversation] End failed:", e);
      onConversationEnded();
    }
  }, [isRecording, onConversationEnded]);

  return (
    <div
      className="w-full h-screen flex flex-col"
      style={{ background: "var(--background)" }}
    >
      {/* Drag region for title bar */}
      <div
        data-tauri-drag-region
        style={{
          height: isMac ? 28 : 32,
          flexShrink: 0,
        }}
      />

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="yapper-scroll flex-1 overflow-y-auto"
        style={{
          padding: "12px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Empty state */}
        {turns.length === 0 && !isRecording && !isProcessing && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              position: "relative",
            }}
          >
            {/* Yapp... with breathing hue beneath */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Breathing hue */}
              <motion.div
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.25, 0.6, 0.25],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  position: "absolute",
                  width: 240,
                  height: 120,
                  borderRadius: "50%",
                  background: "radial-gradient(ellipse, rgba(218,119,86,0.25) 0%, rgba(218,119,86,0.08) 40%, transparent 65%)",
                  filter: "blur(30px)",
                  pointerEvents: "none",
                }}
              />
              <span
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 44,
                  fontWeight: 400,
                  color: "var(--yapper-accent)",
                  lineHeight: 1,
                  position: "relative",
                }}
              >
                Yapp<span style={{ fontSize: 14, position: "relative", top: 2, letterSpacing: 2 }}>...</span>
              </span>
            </div>

            <p
              style={{
                fontSize: FONT_SIZE.base,
                color: "var(--yapper-text-secondary)",
                lineHeight: 1.5,
                textAlign: "center",
                position: "relative",
              }}
            >
              Press{" "}
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--yapper-text-primary)",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "var(--yapper-surface-lowest, #fff)",
                  boxShadow: "var(--yapper-card-shadow)",
                  fontSize: FONT_SIZE.sm,
                }}
              >
                {formatHotkeyDisplay(hotkey)}
              </span>{" "}
              and start yapping
            </p>
          </div>
        )}

        {/* Turn messages */}
        <AnimatePresence>
          {turns.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                display: "flex",
                justifyContent: turn.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, maxWidth: "80%" }}>
                {turn.role === "assistant" && <AiCopyButton text={turn.content} />}
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: turn.role === "user"
                      ? `${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px 4px ${BORDER_RADIUS.lg}px`
                      : `${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px 4px`,
                    background:
                      turn.role === "user"
                        ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
                        : "var(--yapper-surface-lowest, #fff)",
                    color:
                      turn.role === "user"
                        ? "#fff"
                        : "var(--foreground)",
                    fontSize: FONT_SIZE.base,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    boxShadow: turn.role === "user"
                      ? "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(0,0,0,0.08)"
                      : "var(--yapper-card-shadow)",
                    border: turn.role === "user"
                      ? "1px solid rgba(255,255,255,0.1)"
                      : "1px solid var(--yapper-border)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {turn.content}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Recording indicator */}
        {isRecording && <RecordingIndicator />}

        {/* Processing / Streaming indicator */}
        {isProcessing && <ProcessingIndicator streamingContent={streamingContent} />}

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", justifyContent: "flex-start" }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: `${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px ${BORDER_RADIUS.lg}px 4px`,
                background: "rgba(218, 119, 86, 0.1)",
                border: "1px solid rgba(218, 119, 86, 0.3)",
                color: "#DA7756",
                fontSize: FONT_SIZE.sm,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom controls */}
      <ConversationControls
        onCancel={cancelConversation}
        onRefresh={refreshConversation}
        onEnd={endConversation}
        isEnding={isEnding}
        hasTurns={turns.length > 0}
        recordingSeconds={recordingSeconds}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
