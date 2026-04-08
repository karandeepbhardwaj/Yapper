import { motion } from "motion/react";
import { Mic, Globe, FileText, MessageSquare, Sparkles, Link, BrainCircuit, BookOpen, Zap, Palette, Code } from "lucide-react";

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
            <SectionHeader icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }>
              Screen Capture
            </SectionHeader>
            <ExampleRow command="What's on my screen" description="Captures and summarizes visible screen" />
            <ExampleRow command="Screen summarize" description="Same as above — summarize screen content" />
            <ExampleRow command="Screen extract text" description="OCR — extracts text from screen" />
            <ExampleRow command="Screen explain" description="Detailed explanation of what's visible" />
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8, paddingLeft: 12 }}>
              You can also use {formatHotkey("Cmd+Shift+S")} to capture a screen region.
            </div>
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

          <SectionCard>
            <SectionHeader icon={<Palette style={{ width: 14, height: 14 }} />}>Refinement Style</SectionHeader>
            <div style={{ fontSize: 12, color: "var(--yapper-text-secondary)", lineHeight: 1.5 }}>
              Set a default tone for all refinements in <strong style={{ color: "var(--yapper-text-primary)" }}>Settings</strong>. You can also override per category.
            </div>
            <ExampleRow command="Professional" description="Clear and concise. Great for work emails and notes." />
            <ExampleRow command="Casual" description="Natural and conversational. Good for messages and personal notes." />
            <ExampleRow command="Technical" description="Precise terminology preserved. Ideal for engineering discussions." />
            <ExampleRow command="Creative" description="Vivid and expressive. Adds flair while keeping your meaning." />
            <div style={{ fontSize: 11, color: "var(--yapper-text-secondary)", lineHeight: 1.4, fontStyle: "italic" }}>
              Tip: Set category overrides to use Casual for Messages but Professional for Work.
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<Code style={{ width: 14, height: 14 }} />}>Code Mode</SectionHeader>
            <div style={{ fontSize: 12, color: "var(--yapper-text-secondary)", lineHeight: 1.5 }}>
              Enable in <strong style={{ color: "var(--yapper-text-primary)" }}>Settings</strong> when dictating technical content. Yapper will preserve code references and format them with <code style={{ background: "rgba(0,0,0,0.06)", borderRadius: 3, padding: "1px 4px", fontSize: "0.9em" }}>backticks</code>.
            </div>
            <ExampleRow command="The useEffect hook in App.tsx handles the state update" description="Preserves useEffect, App.tsx as code references" />
            <ExampleRow command="We need to refactor the handleSubmit function" description="Keeps handleSubmit as an identifier, not plain English" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<BookOpen style={{ width: 14, height: 14 }} />}>Dictionary</SectionHeader>
            <div style={{ fontSize: 12, color: "var(--yapper-text-secondary)", lineHeight: 1.5 }}>
              Add text replacements that run <strong style={{ color: "var(--yapper-text-primary)" }}>before</strong> AI refinement. Useful for fixing words that speech recognition consistently gets wrong.
            </div>
            <ExampleRow command="kuber netties → Kubernetes" description="Fix misheard technical terms" />
            <ExampleRow command="react native → React Native" description="Enforce correct capitalization" />
            <ExampleRow command="john's app → JohnsApp" description="Map spoken names to project names" />
          </SectionCard>

          <SectionCard>
            <SectionHeader icon={<Zap style={{ width: 14, height: 14 }} />}>Snippets</SectionHeader>
            <div style={{ fontSize: 12, color: "var(--yapper-text-secondary)", lineHeight: 1.5 }}>
              Trigger phrases that expand to full text <strong style={{ color: "var(--yapper-text-primary)" }}>instantly</strong>, bypassing AI entirely. Paste canned responses with your voice.
            </div>
            <ExampleRow command="on it" description="Expands to: Thanks for reaching out! I'm looking into this and will get back to you shortly." />
            <ExampleRow command="standup update" description="Expands to: Yesterday I worked on... Today I'm planning to... No blockers." />
            <ExampleRow command="lgtm" description="Expands to: Looks good to me! Approved and ready to merge." />
          </SectionCard>

        </div>
      </motion.div>
    </div>
  );
}
