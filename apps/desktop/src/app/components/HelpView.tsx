import { motion } from "motion/react";
import { Mic, Globe, FileText, MessageSquare, Sparkles, Link, BrainCircuit } from "lucide-react";

const isMac = navigator.platform.toUpperCase().includes("MAC");

interface HelpViewProps {
  onBack: () => void;
  hotkey: string;
  conversationHotkey: string;
}

function formatHotkey(hotkey: string): string {
  if (hotkey.toLowerCase() === "fn") return "fn";
  return hotkey
    .replace(/Cmd\+/gi, "\u2318")
    .replace(/Shift\+/gi, "\u21e7")
    .replace(/Alt\+/gi, "\u2325")
    .replace(/Ctrl\+/gi, "\u2303")
    .replace(/Meta\+/gi, "\u2318");
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--yapper-surface-lowest)",
        border: "1px solid rgba(0,0,0,0.05)",
        borderRadius: 16,
        padding: "18px 20px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "rgba(218,119,86,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--yapper-accent)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontFamily: "var(--font-headline)",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--yapper-accent)",
          margin: 0,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {children}
      </h3>
    </div>
  );
}

function ExampleRow({ command, description }: { command: string; description?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--yapper-text-primary)",
          fontStyle: "italic",
        }}
      >
        "{command}"
      </div>
      {description && (
        <div
          style={{
            fontSize: 11,
            color: "var(--yapper-text-secondary)",
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
}

export function HelpView({ onBack, hotkey, conversationHotkey }: HelpViewProps) {
  return (
    <div
      className="w-full h-screen flex flex-col"
      style={{ background: "var(--background)" }}
    >
      <div
        data-tauri-drag-region
        style={{ height: isMac ? 28 : 32, flexShrink: 0 }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 20px", marginBottom: 16, flexShrink: 0, minHeight: 36 }}>
        <motion.button
          onClick={onBack}
          aria-label="Back"
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--yapper-accent)", padding: 0,
          }}
        >
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="var(--yapper-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 1 L1 9 L9 17" />
          </svg>
        </motion.button>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontWeight: 400,
          fontSize: 32,
          color: "var(--yapper-text-primary)",
          lineHeight: 1,
          margin: 0,
        }}>
          How to Yapp
        </h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="yapper-scroll flex-1 overflow-y-auto"
        style={{
          padding: "4px 20px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>

          <SectionCard>
            <SectionHeader icon={<Mic style={{ width: 14, height: 14 }} />}>Dictation</SectionHeader>
            <div
              style={{
                fontSize: 12,
                color: "var(--yapper-text-secondary)",
                lineHeight: 1.5,
              }}
            >
              Press <strong style={{ color: "var(--yapper-text-primary)" }}>{formatHotkey(hotkey)}</strong> and speak naturally. Yapper refines your words and pastes them at your cursor.
            </div>
            <ExampleRow command="I need to follow up with Sarah about the quarterly report" description="Cleaned up and pasted as polished text" />
            <ExampleRow command="The API should use JWT tokens with 24 hour expiry" description="Technical language preserved, grammar fixed" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<Globe style={{ width: 14, height: 14 }} />}>Translate</SectionHeader>
            <ExampleRow command="Translate this to Spanish" description="Translates whatever is on your clipboard" />
            <ExampleRow command="Translate hello world to French" description="Translates your spoken words directly" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<Sparkles style={{ width: 14, height: 14 }} />}>Summarize</SectionHeader>
            <ExampleRow command="Summarize this" description="Copy text first, then speak \u2014 pastes a concise summary" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<FileText style={{ width: 14, height: 14 }} />}>Draft</SectionHeader>
            <ExampleRow command="Draft an email about tomorrow's standup" description="Generates a full email with subject line" />
            <ExampleRow command="Draft a message to the team about the deploy" description="Short, concise message format" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<BrainCircuit style={{ width: 14, height: 14 }} />}>Explain</SectionHeader>
            <ExampleRow command="Explain this code" description="Copy code first \u2014 pastes a clear explanation" />
            <ExampleRow command="Explain this function" description="Works with any content on your clipboard" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<Link style={{ width: 14, height: 14 }} />}>Chaining</SectionHeader>
            <ExampleRow command="Translate this to French and then summarize it" description="Runs multiple commands in sequence" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<MessageSquare style={{ width: 14, height: 14 }} />}>Conversation</SectionHeader>
            <div
              style={{
                fontSize: 12,
                color: "var(--yapper-text-secondary)",
                lineHeight: 1.5,
              }}
            >
              Press <strong style={{ color: "var(--yapper-text-primary)" }}>{formatHotkey(conversationHotkey)}</strong> to start a back-and-forth chat with AI. Speak your turns, and end the conversation to save it with a summary.
            </div>
          </SectionCard>

        </div>
      </motion.div>
    </div>
  );
}
