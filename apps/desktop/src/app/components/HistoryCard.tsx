import { useState } from "react";
import { Copy, ChevronDown, ChevronUp, Check, Star, Pin } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
}: HistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const copyTimer = useState<ReturnType<typeof setTimeout> | null>(null);

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
    if (copyTimer[0]) clearTimeout(copyTimer[0]);
    copyTimer[0] = setTimeout(() => setIsCopied(false), 800);
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
    if (copyTimer[0]) clearTimeout(copyTimer[0]);
  };

  const isPinnedCard = isPinned || variant === "pinned";
  const isFeatured = variant === "featured";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className="cursor-pointer transition-all duration-300"
      style={{
        borderRadius: 20,
        padding: isFeatured ? 24 : 16,
        background: isPinnedCard
          ? "#000000"
          : isFeatured
          ? "var(--yapper-surface-lowest, #ffffff)"
          : "var(--yapper-surface-low, var(--yapper-bg-light))",
        boxShadow: isHovered && !isPinnedCard
          ? "0 12px 40px rgba(25, 28, 29, 0.06)"
          : "none",
        transform: isHovered ? "scale(1.005)" : "scale(1)",
        transition: "box-shadow 0.3s, transform 0.3s",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header: category + timestamp */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: isFeatured ? 16 : 10,
        gap: 8,
        minWidth: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isPinnedCard && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <Star style={{ width: 12, height: 12, color: "var(--yapper-accent)", fill: "var(--yapper-accent)", flexShrink: 0 }} />
              <span style={{
                fontSize: 10,
                fontWeight: 300,
                color: "rgba(255,255,255,0.6)",
              }}>
                Pinned
              </span>
            </div>
          )}
          {category && !isPinnedCard && (
            <span
              style={{
                display: "inline-block",
                padding: "3px 8px",
                borderRadius: 9999,
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                background: "var(--yapper-surface-high, var(--yapper-bg-light))",
                color: "var(--yapper-text-secondary)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {category}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 300,
          color: isPinnedCard ? "rgba(255,255,255,0.5)" : "var(--yapper-text-secondary)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {formatTimestamp(timestamp)}
        </span>
      </div>

      {/* Title */}
      {title && (
        <h3 style={{
          fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
          fontWeight: 700,
          fontSize: isFeatured ? 22 : 16,
          lineHeight: 1.3,
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
      <div className="relative flex-1">
        <div
          style={{
            fontSize: isFeatured ? 16 : 13,
            lineHeight: 1.7,
            color: isPinnedCard ? "rgba(255,255,255,0.75)" : "var(--yapper-text-secondary)",
            display: "-webkit-box",
            WebkitLineClamp: isFeatured ? 5 : 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            paddingRight: 36,
          }}
        >
          {refinedText}
        </div>

        {/* Action buttons (copy + pin) */}
        <div
          className="absolute top-0 right-0 transition-opacity duration-150"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            opacity: isHovered ? 1 : 0,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            title="Copy"
            style={{
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              background: isPinnedCard ? "rgba(255,255,255,0.1)" : "var(--yapper-surface-high, var(--yapper-bg-light))",
              border: "none",
              cursor: "pointer",
            }}
          >
            {isCopied ? (
              <Check style={{ width: 13, height: 13, color: "var(--yapper-accent)" }} />
            ) : (
              <Copy style={{ width: 13, height: 13, color: isPinnedCard ? "rgba(255,255,255,0.6)" : "var(--yapper-text-secondary)" }} />
            )}
          </button>
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
              title={isPinned ? "Unpin" : "Pin"}
              style={{
                width: 26,
                height: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 7,
                background: isPinned
                  ? "var(--yapper-accent)"
                  : isPinnedCard
                  ? "rgba(255,255,255,0.1)"
                  : "var(--yapper-surface-high, var(--yapper-bg-light))",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Pin style={{
                width: 13,
                height: 13,
                color: isPinned ? "#fff" : isPinnedCard ? "rgba(255,255,255,0.6)" : "var(--yapper-text-secondary)",
                transform: isPinned ? "rotate(45deg)" : "none",
              }} />
            </button>
          )}
        </div>
      </div>

      {/* Raw Transcript Toggle */}
      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          className="flex items-center gap-1.5"
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: isPinnedCard ? "rgba(255,255,255,0.4)" : "var(--yapper-text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {isExpanded ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
          <span>Raw Transcript</span>
        </button>

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
                  borderRadius: 12,
                  fontSize: 12,
                  lineHeight: 1.7,
                  background: isPinnedCard ? "rgba(255,255,255,0.06)" : "var(--yapper-surface-high, var(--yapper-bg-light))",
                  color: isPinnedCard ? "rgba(255,255,255,0.5)" : "var(--yapper-text-secondary)",
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
