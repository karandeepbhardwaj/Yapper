import { ArrowRight } from "lucide-react";
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
        {/* Brand name */}
        <motion.h1
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontWeight: 400,
            fontSize: 80,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            color: "var(--yapper-text-primary, #1a1816)",
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          Yapper
          <span style={{ color: "var(--yapper-accent, #DA7756)", fontSize: 24, position: "relative", top: 2, marginLeft: 0 }}>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  times: [0, 0.2, 0.7, 1],
                  ease: "easeInOut",
                }}
              >
                .
              </motion.span>
            ))}
          </span>
        </motion.h1>

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
            background: "linear-gradient(180deg, #e08564 0%, #DA7756 100%)",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            outline: "none",
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.18) inset, 0 -1px 0 0 rgba(0,0,0,0.08) inset, 0 12px 40px rgba(218, 119, 86, 0.25), 0 4px 12px rgba(0,0,0,0.08)",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          whileHover={{
            scale: 1.02,
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.22) inset, 0 -1px 0 0 rgba(0,0,0,0.1) inset, 0 16px 48px rgba(218, 119, 86, 0.35), 0 6px 16px rgba(0,0,0,0.1)",
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
