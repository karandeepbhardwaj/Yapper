import { Mic, Loader2, Sparkles } from "lucide-react";
import { motion } from "motion/react";

type WidgetState = "idle" | "listening" | "processing";

interface FloatingWidgetProps {
  state: WidgetState;
  onStateChange: (state: WidgetState) => void;
}

export function FloatingWidget({ state, onStateChange }: FloatingWidgetProps) {
  const handleClick = () => {
    if (state === "idle") {
      onStateChange("listening");
    } else if (state === "listening") {
      onStateChange("idle");
    }
    // "processing" state is not clickable — controlled by backend
  };

  return (
    <motion.button
      onClick={handleClick}
      disabled={state === "processing"}
      className="fixed bottom-8 right-8 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md cursor-pointer border-0 outline-none focus:outline-none z-50"
      style={{
        background:
          state === "idle"
            ? "var(--claude-bg-lighter)"
            : state === "listening"
            ? "var(--claude-orange)"
            : "var(--claude-orange-dark)",
        border: state === "idle" ? "1px solid var(--claude-border)" : "none",
        cursor: state === "processing" ? "wait" : "pointer",
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={
        state === "listening"
          ? {
              boxShadow: [
                "0 0 0 0 rgba(232, 155, 125, 0.7)",
                "0 0 0 20px rgba(232, 155, 125, 0)",
              ],
            }
          : {}
      }
      transition={{
        boxShadow: {
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }}
    >
      {state === "idle" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          <Mic className="w-6 h-6" style={{ color: "var(--claude-text-secondary)" }} />
        </motion.div>
      )}

      {state === "listening" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative"
        >
          <Mic className="w-6 h-6 text-white" />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-0.5 bg-white rounded-full"
                animate={{ height: ["4px", "12px", "4px"] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {state === "processing" && (
        <motion.div
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          transition={{
            rotate: { duration: 2, repeat: Infinity, ease: "linear" },
          }}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </motion.div>
      )}
    </motion.button>
  );
}
