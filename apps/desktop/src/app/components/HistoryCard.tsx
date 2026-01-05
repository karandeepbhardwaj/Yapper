import { useState } from "react";
import { Copy, ChevronDown, ChevronUp, Check, Star } from "lucide-react";
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
}

export function HistoryCard({
  timestamp,
  refinedText,
  rawTranscript,
  variant = "compact",
  category,
  title,
  isPinned,
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
        borderRadius: 24,
        padding: isFeatured ? 28 : 22,
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
      <div className="flex items-center justify-between" style={{ marginBottom: isFeatured ? 16 : 12 }}>
        <div className="flex items-center gap-2">
          {isPinnedCard && (
            <div className="flex items-center gap-1.5">
              <Star style={{ width: 14, height: 14, color: "var(--yapper-accent)", fill: "var(--yapper-accent)" }} />
              <span style={{
                fontSize: 11,
                fontWeight: 300,
                color: isPinnedCard ? "rgba(255,255,255,0.6)" : "var(--yapper-text-secondary)",
              }}>
                Pinned Recording
              </span>
            </div>
          )}
          {category && !isPinnedCard && (
            <span
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                background: "var(--yapper-surface-high, var(--yapper-bg-light))",
                color: "var(--yapper-text-secondary)",
              }}
            >
              {category}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 12,
          fontWeight: 300,
          color: isPinnedCard ? "rgba(255,255,255,0.5)" : "var(--yapper-text-secondary)",
        }}>
          {formatTimestamp(timestamp)}
        </span>
      </div>

      {/* Title */}
      {title && (
        <h3 style={{
          fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
          fontWeight: 700,
          fontSize: isFeatured ? 26 : 18,
          lineHeight: 1.25,
          letterSpacing: "-0.02em",
          color: isPinnedCard ? "#ffffff" : "var(--yapper-text-primary)",
          marginBottom: 10,
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
            paddingRight: 32,
          }}
        >
          {refinedText}
        </div>

        {/* Copy Button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          className="absolute top-0 right-0 transition-opacity duration-150"
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: isPinnedCard ? "rgba(255,255,255,0.1)" : "var(--yapper-surface-high, var(--yapper-bg-light))",
            border: "none",
            cursor: "pointer",
            opacity: isHovered ? 1 : 0,
          }}
        >
          {isCopied ? (
            <Check style={{ width: 14, height: 14, color: "var(--yapper-accent)" }} />
          ) : (
            <Copy style={{ width: 14, height: 14, color: isPinnedCard ? "rgba(255,255,255,0.6)" : "var(--yapper-text-secondary)" }} />
          )}
        </button>
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
