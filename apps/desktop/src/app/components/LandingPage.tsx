import { Mic, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div
      className="relative h-screen flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        background: `
          radial-gradient(circle at 80% 20%, rgba(218, 119, 86, 0.12) 0%, transparent 40%),
          radial-gradient(circle at 10% 80%, rgba(218, 119, 86, 0.05) 0%, transparent 50%),
          var(--background, #faf6f1)
        `,
      }}
    >
      {/* Subliminal Y. branding */}
      <div
        className="absolute top-8 left-8"
        style={{
          fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
          fontWeight: 900,
          fontSize: 28,
          letterSpacing: "-0.04em",
          opacity: 0.08,
          color: "var(--foreground, #000)",
        }}
      >
        Y.
      </div>

      {/* Background blobs */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-10%",
          right: "-5%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "rgba(218, 119, 86, 0.06)",
          filter: "blur(80px)",
          opacity: 0.4,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-5%",
          left: "-10%",
          width: 350,
          height: 350,
          borderRadius: "50%",
          background: "rgba(218, 119, 86, 0.04)",
          filter: "blur(80px)",
        }}
      />

      {/* Main content */}
      <motion.section
        className="relative z-10 flex flex-col items-center text-center"
        style={{ gap: 48 }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Mic icon */}
        <motion.div
          className="flex items-center justify-center"
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: "var(--yapper-surface-lowest, #fffcf9)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.06)",
          }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 200, damping: 20 }}
        >
          <Mic
            style={{
              width: 36,
              height: 36,
              color: "#DA7756",
            }}
          />
        </motion.div>

        {/* Brand name */}
        <motion.h1
          style={{
            fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
            fontWeight: 800,
            fontSize: 80,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            color: "var(--yapper-text-primary, #1a1816)",
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          Yapper
        </motion.h1>

        {/* Tagline */}
        <motion.p
          style={{
            fontFamily: "var(--font-body, 'Inter', sans-serif)",
            fontSize: 18,
            fontWeight: 300,
            lineHeight: 1.7,
            color: "var(--yapper-text-secondary, #6b6560)",
            maxWidth: 380,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          Voice recordings treated as{" "}
          <span style={{ fontStyle: "italic", fontWeight: 500, color: "var(--yapper-text-primary, #1a1816)" }}>
            precious artifacts
          </span>
          . Curated. Focused. Silent.
        </motion.p>

        {/* CTA Button */}
        <motion.button
          onClick={onGetStarted}
          className="group"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "16px 48px",
            fontFamily: "var(--font-body, 'Inter', sans-serif)",
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "0.02em",
            color: "#ffffff",
            background: "#DA7756",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            outline: "none",
            boxShadow: "0 12px 40px rgba(218, 119, 86, 0.25)",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          whileHover={{
            scale: 1.02,
            boxShadow: "0 16px 48px rgba(218, 119, 86, 0.35)",
          }}
          whileTap={{ scale: 0.96 }}
        >
          <span>Get Started</span>
          <ArrowRight style={{ width: 18, height: 18, transition: "transform 0.2s" }} />
        </motion.button>
      </motion.section>
    </div>
  );
}
