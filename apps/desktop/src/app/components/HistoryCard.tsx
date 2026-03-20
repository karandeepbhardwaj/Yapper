import { useState } from "react";
import { Copy, ChevronDown, ChevronUp, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function formatTimestamp(raw: string): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw; // fallback for pre-existing formatted strings

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
    return `Today at ${time}`;
  } else if (entryDay.getTime() === yesterday.getTime()) {
    return `Yesterday at ${time}`;
  } else {
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${dateStr} at ${time}`;
  }
}

interface HistoryCardProps {
  timestamp: string;
  refinedText: string;
  rawTranscript: string;
}

export function HistoryCard({ timestamp, refinedText, rawTranscript }: HistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const copyTimer = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = () => {
    // Copy text
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(refinedText).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    } catch {
      fallbackCopy();
    }

    // Show check icon briefly
    setIsCopied(true);
    if (copyTimer[0]) clearTimeout(copyTimer[0]);
    copyTimer[0] = setTimeout(() => setIsCopied(false), 800);
  };

  const fallbackCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = refinedText;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(textArea);
  };

  // Reset copied state when mouse leaves the card
  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsCopied(false);
    if (copyTimer[0]) clearTimeout(copyTimer[0]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-4 mb-3"
      style={{
        background: "var(--claude-bg-lighter)",
        border: "1px solid var(--claude-border)",
      }}
    >
      {/* Timestamp */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs"
          style={{ color: "var(--claude-text-secondary)" }}
        >
          {formatTimestamp(timestamp)}
        </span>
      </div>

      {/* Refined Text */}
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="text-sm leading-relaxed mb-3 pr-8"
          style={{ color: "var(--claude-text-primary)" }}
        >
          {refinedText}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 p-2 rounded-lg transition-opacity duration-150"
          style={{
            background: "var(--claude-bg-light)",
            border: "1px solid var(--claude-border)",
            opacity: isHovered ? 1 : 0,
            cursor: "pointer",
          }}
        >
          {isCopied ? (
            <Check className="w-4 h-4" style={{ color: "var(--claude-orange)" }} />
          ) : (
            <Copy className="w-4 h-4" style={{ color: "var(--claude-text-secondary)" }} />
          )}
        </button>
      </div>

      {/* Raw Transcript Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs w-full"
        style={{ color: "var(--claude-text-secondary)" }}
      >
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        <span>Raw Transcript</span>
      </button>

      {/* Raw Transcript Content */}
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
              className="mt-3 p-3 rounded-lg text-xs leading-relaxed"
              style={{
                background: "var(--claude-bg-light)",
                color: "var(--claude-text-secondary)",
              }}
            >
              {rawTranscript}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
