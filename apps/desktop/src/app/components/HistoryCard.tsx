import { useState, useRef } from "react";
import { Copy, ChevronDown, Check, Star, Pin, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function IconButton({
  onClick,
  title,
  isPinned,
  isActive,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  isPinned?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.8 }}
      animate={{
        scale: hovered ? 1.15 : 1,
        opacity: isActive ? 1 : hovered ? 1 : 0.3,
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        background: hovered ? "var(--yapper-surface-high, rgba(0,0,0,0.04))" : "none",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        color: isActive
          ? "var(--yapper-accent)"
          : isPinned ? "rgba(255,255,255,0.5)" : "var(--yapper-text-secondary)",
      }}
    >
      {children}
    </motion.button>
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
}: HistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsCopied(false);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  };

  const isPinnedCard = isPinned || variant === "pinned";
  const isFeatured = variant === "featured";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        borderRadius: 16,
        padding: isPinnedCard ? "18px 20px" : isFeatured ? "22px 22px" : "16px 18px",
        background: isPinnedCard
          ? "var(--yapper-pinned-bg, linear-gradient(135deg, #2a1a10 0%, #1a0e06 100%))"
          : "var(--yapper-surface-lowest, #ffffff)",
        boxShadow: isPinnedCard
          ? isHovered
            ? "0 8px 32px rgba(174, 50, 0, 0.2), 0 2px 8px rgba(174, 50, 0, 0.1)"
            : "0 4px 20px rgba(174, 50, 0, 0.12), 0 1px 4px rgba(0,0,0,0.08)"
          : isHovered
            ? "0 8px 32px rgba(174, 50, 0, 0.08), 0 2px 8px rgba(0,0,0,0.06)"
            : "0 2px 12px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)",
        border: isPinnedCard
          ? "1px solid rgba(174, 50, 0, 0.25)"
          : "1px solid var(--yapper-border)",
        transform: isHovered ? "translateY(-1px)" : "translateY(0)",
        transition: "box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: isFeatured ? 14 : 10,
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          {isPinnedCard && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px 2px 6px",
              borderRadius: 8,
              background: "rgba(174, 50, 0, 0.15)",
            }}>
              <Star style={{ width: 10, height: 10, color: "var(--yapper-accent)", fill: "var(--yapper-accent)", flexShrink: 0 }} />
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--yapper-accent)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                Pinned
              </span>
            </div>
          )}
          {category && !isPinnedCard && (
            <span
              style={{
                display: "inline-block",
                padding: "3px 10px",
                borderRadius: 8,
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "var(--yapper-accent-light, #ffdbd0)",
                color: "var(--yapper-accent-dark, #852400)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {category}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <IconButton
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            title="Copy"
            isPinned={isPinnedCard}
          >
            <AnimatePresence mode="wait">
              {isCopied ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  style={{ display: "flex" }}
                >
                  <Check style={{ width: 13, height: 13, color: "var(--yapper-accent)" }} />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: "flex" }}
                >
                  <Copy style={{ width: 13, height: 13 }} />
                </motion.div>
              )}
            </AnimatePresence>
          </IconButton>
          {onTogglePin && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
              title={isPinned ? "Unpin" : "Pin"}
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
          fontSize: isFeatured ? 20 : isPinnedCard ? 17 : 15,
          lineHeight: 1.35,
          letterSpacing: "-0.02em",
          color: isPinnedCard ? "#ffffff" : "var(--yapper-text-primary)",
          marginBottom: 8,
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
          fontSize: isFeatured ? 14 : 13,
          lineHeight: 1.7,
          color: isPinnedCard ? "rgba(255,255,255,0.7)" : "var(--yapper-text-secondary)",
          display: "-webkit-box",
          WebkitLineClamp: isFeatured ? 4 : 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {refinedText}
      </div>

      {/* Bottom row: Raw Transcript toggle + Timestamp */}
      <div style={{ marginTop: 12 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <motion.button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            whileHover={{ opacity: 0.8 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: isPinnedCard ? "rgba(255,255,255,0.35)" : "var(--yapper-text-secondary)",
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

          <span style={{
            fontSize: 11,
            fontWeight: 400,
            color: isPinnedCard ? "rgba(255,255,255,0.35)" : "var(--yapper-text-secondary)",
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
                  fontSize: 12,
                  lineHeight: 1.7,
                  background: isPinnedCard ? "rgba(255,255,255,0.06)" : "var(--yapper-surface-low, var(--yapper-bg-light))",
                  color: isPinnedCard ? "rgba(255,255,255,0.45)" : "var(--yapper-text-secondary)",
                }}
              >
                {rawTranscript}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
