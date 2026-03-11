import { useState, useRef } from "react";
import { Copy, ChevronDown, Check, Star, Pin, Trash2, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { ConversationData } from "../lib/types";
import { FONT_SIZE, SPACING, BORDER_RADIUS } from "../lib/tokens";

/* Extracted standalone components (Finding #14) */

function CopyButton({ text, isPinned }: { text: string; isPinned?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch((err) => console.error("Failed to copy to clipboard:", err));
      }
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
      className={copied ? "" : (isPinned ? "hover-opacity-high" : "copy-btn-hover")}
      style={{
        display: "flex",
        alignItems: "center",
        padding: 3,
        background: "none",
        border: "none",
        cursor: "pointer",
        borderRadius: 4,
        color: isPinned ? "rgba(255,255,255,0.85)" : "var(--yapper-text-secondary)",
        opacity: copied ? 1 : undefined,
        transition: "opacity 0.15s",
      }}
    >
      {copied
        ? <Check style={{ width: 11, height: 11, color: isPinned ? "#fff" : "var(--yapper-accent)" }} />
        : <Copy style={{ width: 11, height: 11 }} />
      }
    </button>
  );
}

function ConversationTurnBubble({
  role,
  content,
  isPinnedCard,
}: {
  role: string;
  content: string;
  isPinnedCard: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: role === "user" ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, maxWidth: "85%" }}>
        {role === "assistant" && (
          <CopyButton text={content} isPinned={isPinnedCard} />
        )}
        <div
          style={{
            padding: "8px 12px",
            borderRadius: role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
            background: role === "user"
              ? isPinnedCard
                ? "rgba(255,255,255,0.2)"
                : "var(--yapper-accent)"
              : isPinnedCard
                ? "rgba(0,0,0,0.12)"
                : "var(--yapper-surface-low, var(--yapper-bg-light))",
            color: isPinnedCard
              ? "#fff"
              : role === "user"
                ? "#fff"
                : "var(--yapper-text-secondary)",
            fontSize: FONT_SIZE.sm,
            lineHeight: 1.5,
            ...(isPinnedCard ? {
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.1)",
            } : {}),
          }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  ariaLabel,
  isPinned,
  isActive,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  ariaLabel: string;
  isPinned?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="icon-btn-hover"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        background: "none",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        opacity: isActive ? 1 : isPinned ? 0.7 : undefined,
        color: isActive
          ? isPinned ? "#fff" : "var(--yapper-accent)"
          : isPinned ? "rgba(255,255,255,0.85)" : "var(--yapper-text-secondary)",
        transition: "opacity 0.15s, transform 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function formatTimestamp(raw: string): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (entryDay.getTime() === today.getTime()) {
    return `Today \u00b7 ${time}`;
  } else if (entryDay.getTime() === yesterday.getTime()) {
    return `Yesterday \u00b7 ${time}`;
  } else {
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${dateStr} \u00b7 ${time}`;
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatActionLabel(action: string, params?: Record<string, string>): string {
  switch (action) {
    case "translate":
      return params?.targetLang ? `Translated to ${params.targetLang}` : "Translated";
    case "summarize":
      return "Summarized";
    case "draft":
      return params?.type ? `Drafted ${params.type}` : "Drafted";
    case "explain":
      return "Explained";
    case "chain":
      return params?.steps ? params.steps.split(" + ").map(s =>
        s.charAt(0).toUpperCase() + s.slice(1)
      ).join(" + ") : "Chained";
    case "unrefined":
      return "Not AI Refined";
    default:
      return action.charAt(0).toUpperCase() + action.slice(1);
  }
}

interface HistoryCardProps {
  timestamp: string;
  refinedText: string;
  rawTranscript: string;
  variant?: "featured" | "compact" | "pinned";
  category?: string;
  title?: string;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onDelete?: () => void;
  entryType?: string;
  conversation?: ConversationData;
  durationSeconds?: number;
  isHovered?: boolean;
  action?: string;
  actionParams?: Record<string, string>;
}

export function HistoryCard({
  timestamp,
  refinedText,
  rawTranscript,
  variant = "compact",
  category,
  title,
  isPinned,
  onTogglePin,
  onDelete,
  entryType,
  conversation,
  durationSeconds,
  isHovered = false,
  action,
  actionParams,
}: HistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConversationExpanded, setIsConversationExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(refinedText).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    } catch {
      fallbackCopy();
    }
    setIsCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setIsCopied(false), 800);
  };

  const fallbackCopy = () => {
    const ta = document.createElement("textarea");
    ta.value = refinedText;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { console.error("Failed to copy to clipboard:", e); }
    document.body.removeChild(ta);
  };


  const handlePin = () => {
    onTogglePin?.();
  };

  const isPinnedCard = isPinned || variant === "pinned";
  const isFeatured = variant === "featured";

  return (
    <div
      data-card-id={timestamp}
      style={{
        borderRadius: BORDER_RADIUS.xl,
        padding: `${SPACING.lg}px 18px`,
        background: isPinnedCard
          ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
          : "var(--yapper-surface-lowest, #ffffff)",
        boxShadow: isPinnedCard
          ? "0 4px 16px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 1px rgba(0,0,0,0.1)"
          : "var(--yapper-card-shadow)",
        border: isPinnedCard
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid var(--yapper-border)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        transition: "background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease",
      }}
    >
      {/* Isomorphic depth -- pinned only (non-pinned use inset box-shadow) */}
      {isPinnedCard && (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              background: "linear-gradient(160deg, rgba(255,255,255,0.1) 0%, transparent 40%)",
              pointerEvents: "none",
              borderRadius: "16px 16px 0 0",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "30%",
              background: "linear-gradient(0deg, rgba(0,0,0,0.08) 0%, transparent 100%)",
              pointerEvents: "none",
              borderRadius: "0 0 16px 16px",
            }}
          />
        </>
      )}

      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        gap: SPACING.sm,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm, flex: 1, minWidth: 0 }}>
          {isPinnedCard && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px 4px 8px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.12)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}>
              <Star style={{ width: 10, height: 10, color: "#fff", fill: "#fff", flexShrink: 0, position: "relative", top: -0.5 }} />
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                lineHeight: 1,
              }}>
                Pinned
              </span>
            </div>
          )}
          {category && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "5px 12px 4px",
                borderRadius: 20,
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                lineHeight: 1,
                background: isPinnedCard ? "rgba(255,255,255,0.15)" : "rgba(218,119,86,0.1)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                color: isPinnedCard ? "rgba(255,255,255,0.9)" : "var(--yapper-accent-dark, #DA7756)",
                boxShadow: isPinnedCard
                  ? "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.12)"
                  : "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.06)",
                border: isPinnedCard ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(218,119,86,0.12)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {category}
            </span>
          )}
          {action && action !== "dictation" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
                background: action === "unrefined"
                  ? (variant === "pinned" ? "rgba(255,255,255,0.2)" : "rgba(180,130,50,0.12)")
                  : (variant === "pinned" ? "rgba(255,255,255,0.2)" : "rgba(218,119,86,0.12)"),
                color: action === "unrefined"
                  ? (variant === "pinned" ? "rgba(255,255,255,0.7)" : "#b48232")
                  : (variant === "pinned" ? "rgba(255,255,255,0.9)" : "#DA7756"),
              }}
            >
              {formatActionLabel(action, actionParams)}
            </span>
          )}
        </div>

        {/* Action buttons — visible on hover only (CSS class handles visibility) */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            aria-label="Copy to clipboard"
            title="Copy"
            className={isCopied ? "" : (isPinnedCard ? "hover-opacity-high" : "hover-opacity-low")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              padding: "3px 6px",
              background: isCopied
                ? isPinnedCard ? "rgba(255,255,255,0.15)" : "var(--yapper-accent-light, #faf0ec)"
                : "none",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              color: isCopied
                ? isPinnedCard ? "#fff" : "var(--yapper-accent)"
                : isPinnedCard ? "rgba(255,255,255,0.85)" : "var(--yapper-text-secondary)",
              opacity: isCopied ? 1 : undefined,
              transition: "all 0.2s ease",
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            {isCopied ? (
              <>
                <Check style={{ width: 11, height: 11 }} />
                <span>Copied!</span>
              </>
            ) : (
              <Copy style={{ width: 13, height: 13 }} />
            )}
          </button>
          {onTogglePin && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); handlePin(); }}
              title={isPinned ? "Unpin" : "Pin"}
              ariaLabel="Pin item"
              isPinned={isPinnedCard}
              isActive={isPinned}
            >
              <motion.div
                animate={{ rotate: isPinned ? 45 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                style={{ display: "flex" }}
              >
                <Pin style={{ width: 13, height: 13 }} />
              </motion.div>
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete"
              ariaLabel="Delete item"
              isPinned={isPinnedCard}
            >
              <Trash2 style={{ width: 13, height: 13 }} />
            </IconButton>
          )}
        </div>
      </div>

      {/* Title */}
      {title && (
        <h3 style={{
          fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
          fontWeight: 700,
          fontSize: FONT_SIZE.lg,
          lineHeight: 1.35,
          letterSpacing: "-0.02em",
          color: isPinnedCard ? "#fff" : "var(--yapper-text-primary)",
          marginBottom: SPACING.sm,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
        }}>
          {title}
        </h3>
      )}

      {/* Refined Text */}
      <div
        style={{
          fontSize: FONT_SIZE.base,
          lineHeight: 1.7,
          color: isPinnedCard ? "rgba(255,255,255,0.9)" : "var(--yapper-text-secondary)",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {refinedText}
      </div>

      {/* Conversation turns (expandable) */}
      {entryType === "conversation" && conversation && conversation.turns.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <motion.button
            onClick={(e) => { e.stopPropagation(); setIsConversationExpanded(!isConversationExpanded); }}
            whileHover={{ opacity: 0.8 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle conversation turns"
            className="flex items-center gap-1.5"
            style={{
              fontSize: FONT_SIZE.xs,
              fontWeight: 500,
              color: isPinnedCard ? "#fff" : "var(--yapper-accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "opacity 0.2s",
            }}
          >
            <MessageCircle style={{ width: 11, height: 11 }} />
            <motion.div
              animate={{ rotate: isConversationExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex" }}
            >
              <ChevronDown style={{ width: 11, height: 11 }} />
            </motion.div>
            <span>
              View Conversation ({conversation.turns.length} turns
              {durationSeconds ? ` \u00b7 ${formatDuration(durationSeconds)}` : ""})
            </span>
          </motion.button>

          <AnimatePresence>
            {isConversationExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: BORDER_RADIUS.md,
                    background: isPinnedCard
                      ? "rgba(255,255,255,0.12)"
                      : "var(--yapper-surface-low, rgba(0,0,0,0.02))",
                    boxShadow: isPinnedCard
                      ? "inset 0 2px 4px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.08)"
                      : "inset 0 1px 4px rgba(0,0,0,0.06)",
                    padding: "10px 12px",
                  }}
                >
                  <div
                    className="yapper-scroll"
                    style={{
                      maxHeight: 300,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {conversation.turns.map((turn, i) => (
                      <ConversationTurnBubble
                        key={i}
                        role={turn.role}
                        content={turn.content}
                        isPinnedCard={isPinnedCard}
                      />
                    ))}
                  </div>
                </div>

                {/* Key points */}
                {conversation.keyPoints && conversation.keyPoints.length > 0 && (
                  <div style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: isPinnedCard ? "rgba(255,255,255,0.1)" : "var(--yapper-surface-low, var(--yapper-bg-light))",
                    boxShadow: isPinnedCard
                      ? "inset 0 2px 4px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.06)"
                      : "inset 0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}>
                      <p style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: isPinnedCard ? "rgba(255,255,255,0.75)" : "var(--yapper-text-secondary)",
                        opacity: 0.7,
                        margin: 0,
                      }}>
                        Key Points
                      </p>
                      <CopyButton
                        text={conversation.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}
                        isPinned={isPinnedCard}
                      />
                    </div>
                    <ul style={{
                      margin: 0,
                      paddingLeft: SPACING.lg,
                      fontSize: FONT_SIZE.sm,
                      lineHeight: 1.6,
                      color: isPinnedCard ? "rgba(255,255,255,0.9)" : "var(--yapper-text-secondary)",
                    }}>
                      {conversation.keyPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Bottom row: Raw Transcript toggle + Timestamp */}
      <div style={{ marginTop: BORDER_RADIUS.md }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          {entryType !== "conversation" ? (
            <motion.button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              whileHover={{ opacity: 0.8 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Toggle raw transcript"
              className="flex items-center gap-1.5"
              style={{
                fontSize: FONT_SIZE.xs,
                fontWeight: 500,
                color: isPinnedCard ? "rgba(255,255,255,0.75)" : "var(--yapper-text-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                opacity: 0.5,
                transition: "opacity 0.2s",
              }}
            >
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                style={{ display: "flex" }}
              >
                <ChevronDown style={{ width: 12, height: 12 }} />
              </motion.div>
              <span>Raw Transcript</span>
            </motion.button>
          ) : (
            <div />
          )}

          <span style={{
            fontSize: FONT_SIZE.xs,
            fontWeight: 400,
            color: isPinnedCard ? "rgba(255,255,255,0.75)" : "var(--yapper-text-secondary)",
            whiteSpace: "nowrap",
            opacity: 0.6,
          }}>
            {formatTimestamp(timestamp)}
          </span>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                style={{
                  marginTop: 10,
                  padding: 14,
                  borderRadius: 10,
                  fontSize: FONT_SIZE.sm,
                  lineHeight: 1.7,
                  background: isPinnedCard ? "rgba(0,0,0,0.1)" : "var(--yapper-surface-low, var(--yapper-bg-light))",
                  color: isPinnedCard ? "rgba(255,255,255,0.85)" : "var(--yapper-text-secondary)",
                }}
              >
                {rawTranscript}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
