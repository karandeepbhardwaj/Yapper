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

  const handleCopy = () => {
    // Fallback copy method for when Clipboard API is blocked
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(refinedText).then(() => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        }).catch(() => {
          // Fallback to legacy method
          fallbackCopy();
        });
      } else {
        fallbackCopy();
      }
    } catch (err) {
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    // Create a temporary textarea element
    const textArea = document.createElement("textarea");
    textArea.value = refinedText;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }

    document.body.removeChild(textArea);
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
      <div className="relative group">
        <div
          className="text-sm leading-relaxed mb-3 pr-8"
          style={{ color: "var(--claude-text-primary)" }}
        >
          {refinedText}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 p-2 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
          style={{
            background: "var(--claude-bg-light)",
            border: "1px solid var(--claude-border)",
          }}
        >
          <AnimatePresence mode="wait">
            {isCopied ? (
              <motion.div
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Check className="w-4 h-4" style={{ color: "var(--claude-orange)" }} />
              </motion.div>
            ) : (
              <motion.div
                key="copy"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Copy className="w-4 h-4" style={{ color: "var(--claude-text-secondary)" }} />
              </motion.div>
            )}
          </AnimatePresence>
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
