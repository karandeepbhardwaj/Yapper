import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Loader2, MessageCircle, Copy, Check, Moon, Sun } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConversationSummary } from "../lib/types";

const isMac = navigator.platform.toUpperCase().includes("MAC");

function AiCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(text).catch(() => {});
    } catch {}
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 800);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        display: "flex",
        alignItems: "center",
        padding: 3,
        background: "none",
        border: "none",
        cursor: "pointer",
        borderRadius: 4,
        color: "var(--yapper-text-secondary)",
        opacity: copied ? 1 : 0.3,
        transition: "opacity 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.opacity = "0.3"; }}
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
  isDarkMode: boolean;
  onToggleDarkMode: (e?: React.MouseEvent) => void;
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

export function ConversationView({
  onBack,
  onConversationEnded,
  isDarkMode,
  onToggleDarkMode,
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

  // Recording time — only ticks while recording
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const endConversation = useCallback(async () => {
    if (isRecording) {
      try { await invoke("cancel_recording"); } catch {}
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
            {/* Icon with breathing hue behind it */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <motion.div
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  position: "absolute",
                  width: 280,
                  height: 280,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(218,119,86,0.35) 0%, rgba(218,119,86,0.15) 35%, rgba(218,119,86,0.04) 55%, transparent 70%)",
                  filter: "blur(25px)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--yapper-surface-lowest, #fff)",
                  boxShadow: "0 8px 30px rgba(218,119,86,0.25), 0 3px 10px rgba(0,0,0,0.1), var(--yapper-card-shadow)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <MessageCircle style={{ width: 24, height: 24, color: "var(--yapper-accent)" }} />
              </div>
            </div>

            <p
              style={{
                fontSize: 13,
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
                  fontSize: 12,
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
                    borderRadius: turn.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background:
                      turn.role === "user"
                        ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
                        : "var(--yapper-surface-lowest, #fff)",
                    color:
                      turn.role === "user"
                        ? "#fff"
                        : "var(--foreground)",
                    fontSize: 13,
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
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", justifyContent: "flex-end" }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "14px 14px 4px 14px",
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
                      duration: 0.6 + Math.random() * 0.3,
                      repeat: Infinity,
                      delay: i * 0.08,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#fff" }}>Listening...</span>
            </div>
          </motion.div>
        )}

        {/* Streaming AI response */}
        {isProcessing && streamingContent && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", justifyContent: "flex-start" }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "14px 14px 14px 4px",
                background: "var(--yapper-surface-lowest, #fff)",
                boxShadow: "var(--yapper-card-shadow)",
                border: "1px solid var(--yapper-border)",
                color: "var(--foreground)",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {streamingContent}
              <span style={{ opacity: 0.4, animation: "blink 1s infinite" }}>|</span>
            </div>
          </motion.div>
        )}

        {/* Processing indicator */}
        {isProcessing && !streamingContent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: "flex", justifyContent: "flex-start" }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "14px 14px 14px 4px",
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
              <span style={{ fontSize: 12, color: "var(--yapper-text-secondary)" }}>
                Thinking...
              </span>
            </div>
          </motion.div>
        )}

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
                borderRadius: "14px 14px 14px 4px",
                background: "rgba(218, 119, 86, 0.1)",
                border: "1px solid rgba(218, 119, 86, 0.3)",
                color: "#DA7756",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          </motion.div>
        )}
      </div>

      {/* Floating bottom nav bar */}
      <div
        style={{
          margin: "6px 20px 14px",
          padding: "6px",
          borderRadius: 14,
          background: "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)",
          boxShadow: "var(--yapper-accent-bar-shadow)",
          border: "var(--yapper-accent-bar-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
          overflow: "hidden",
        }}
      >
        {/* Isomorphic light overlay */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "50%",
          background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 40%)",
          pointerEvents: "none",
          borderRadius: "14px 14px 0 0",
        }} />

        {/* Left: back */}
        <button
          onClick={onBack}
          style={{
            background: "rgba(0,0,0,0.12)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 7,
            borderRadius: 10,
            color: "#fff",
            position: "relative",
            zIndex: 1,
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
        </button>

        {/* Center: timer — absolute for true centering */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            fontVariantNumeric: "tabular-nums",
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1,
          }}
        >
          {formatTime(recordingSeconds)}
        </span>

        {/* Right: theme + end */}
        <div className="flex items-center" style={{ gap: 5, position: "relative", zIndex: 1 }}>
          <button
            onClick={onToggleDarkMode}
            style={{
              background: "rgba(0,0,0,0.12)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 7,
              borderRadius: 10,
              color: "#fff",
            }}
          >
            <motion.div
              initial={false}
              animate={{ rotate: isDarkMode ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {isDarkMode
                ? <Moon style={{ width: 13, height: 13 }} />
                : <Sun style={{ width: 13, height: 13 }} />
              }
            </motion.div>
          </button>
          <button
            onClick={endConversation}
            disabled={isEnding || turns.length === 0}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "7px 14px",
              borderRadius: 10,
              color: turns.length === 0 ? "rgba(255,255,255,0.35)" : "#fff",
              background: turns.length === 0 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.18)",
              boxShadow: turns.length > 0 ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.08)" : "none",
              border: "none",
              cursor: turns.length === 0 ? "default" : "pointer",
              opacity: isEnding ? 0.5 : 1,
            }}
          >
            {isEnding ? "Summarizing..." : "End"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
