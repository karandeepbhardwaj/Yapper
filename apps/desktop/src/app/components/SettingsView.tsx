import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Home, BookOpen, FileText, ChevronRight, X, ExternalLink, HelpCircle } from "lucide-react";
import { AnimatePresence } from "motion/react";
import fnKeySettingsImg from "../../assets/fn-key-settings.png";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, Metrics } from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/types";

function MetricsDisplay() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    invoke<Metrics>("get_metrics").then(setMetrics).catch((e) => console.error("Failed to load metrics:", e));
  }, []);

  if (!metrics) return null;

  const formatWords = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

  const items = [
    { icon: "🔥", value: `${metrics.streakDays}`, label: "day streak", color: "#DA7756" },
    { icon: "🚀", value: formatWords(metrics.totalWords), label: "words", color: "#c4684a" },
    { icon: "🏅", value: `${Math.round(metrics.avgWpm)}`, label: "avg WPM", color: "#d4943c" },
    { icon: "🎙️", value: `${metrics.totalEntries}`, label: "recordings", color: "#6b7ec2" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "14px 14px",
            borderRadius: 14,
            background: "var(--yapper-surface-low, #f8f4f0)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
          <div>
            <div style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--yapper-text-primary)",
              lineHeight: 1,
              marginBottom: 2,
            }}>
              {item.value}
            </div>
            <div style={{
              fontSize: 11,
              color: "var(--yapper-text-secondary)",
              lineHeight: 1,
            }}>
              {item.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const isMac = navigator.platform.toUpperCase().includes("MAC");

const STYLES = ["Professional", "Casual", "Technical", "Creative"] as const;
const CATEGORIES = ["Email", "Message", "Work", "Personal"] as const;

interface SettingsViewProps {
  onBack: () => void;
  onNavigateDictionary?: () => void;
  onNavigateSnippets?: () => void;
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
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
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
  );
}

function HintBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
          color: "var(--yapper-text-secondary)",
          opacity: 0.5,
        }}
      >
        <HelpCircle style={{ width: 12, height: 12 }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "8px 12px",
              borderRadius: 10,
              background: "var(--yapper-surface-lowest)",
              border: "1px solid var(--yapper-border, #e5e5e5)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              fontSize: 11,
              lineHeight: 1.4,
              color: "var(--yapper-text-secondary)",
              whiteSpace: "normal",
              width: 200,
              zIndex: 20,
              textAlign: "left",
            }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function SettingRow({
  label,
  description,
  hint,
  children,
}: {
  label: string;
  description?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 32,
      }}
    >
      <div style={{ flex: 1 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--yapper-text-primary)",
          }}
        >
          {label}
          {hint && <HintBubble text={hint} />}
        </span>
        {description && (
          <p
            style={{
              fontSize: 11,
              color: "var(--yapper-text-secondary)",
              margin: "2px 0 0",
              lineHeight: 1.3,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: "pointer",
        background: checked
          ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
          : "var(--yapper-surface-low, #ddd)",
        position: "relative",
        transition: "background 0.2s",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={{ x: checked ? 20 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          position: "absolute",
          top: 2,
          left: 0,
        }}
      />
    </button>
  );
}

function PillButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      style={{
        padding: "7px 16px",
        borderRadius: 10,
        border: selected ? "1px solid transparent" : "1px solid var(--yapper-border, #e5e5e5)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        background: selected ? "#DA7756" : "var(--yapper-surface-low, #f5f5f5)",
        color: selected ? "#fff" : "var(--yapper-text-primary)",
        transition: "background 0.2s, color 0.2s, border-color 0.2s",
      }}
    >
      {label}
    </button>
  );
}

function StyleDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 14px",
        paddingRight: 30,
        borderRadius: 10,
        border: "1px solid var(--yapper-border, #ddd)",
        background: "var(--yapper-surface-low, #f5f5f5)",
        color: "var(--yapper-text-primary)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        outline: "none",
        minWidth: 140,
        appearance: "none",
        WebkitAppearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
      }}
    >
      <option value="">Default</option>
      {STYLES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function NavButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "10px 0",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--yapper-text-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--yapper-surface-low, #f0f0f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--yapper-accent)",
          }}
        >
          {icon}
        </div>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      </div>
      <ChevronRight
        style={{
          width: 14,
          height: 14,
          color: "var(--yapper-text-secondary)",
          opacity: 0.5,
        }}
      />
    </button>
  );
}

export function SettingsView({
  onBack,
  onNavigateDictionary,
  onNavigateSnippets,
}: SettingsViewProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await invoke<AppSettings>("get_settings");
        if (!cancelled) {
          setSettings(s);
          setLoaded(true);
        }
      } catch (e) {
        console.error("[Settings] Failed to load:", e);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save helper
  const save = useCallback(
    async (next: AppSettings) => {
      setSettings(next);
      try {
        await invoke("save_settings", { settings: next });
      } catch (e) {
        console.error("[Settings] Failed to save:", e);
      }
    },
    []
  );

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      save(next);
    },
    [settings, save]
  );

  const updateOverride = useCallback(
    (category: string, style: string) => {
      const overrides = { ...settings.style_overrides };
      if (style === "") {
        delete overrides[category];
      } else {
        overrides[category] = style;
      }
      save({ ...settings, style_overrides: overrides });
    },
    [settings, save]
  );

  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [showFnTooltip, setShowFnTooltip] = useState(false);

  // AI Provider: bridge status polling
  const [bridgeConnected, setBridgeConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings.ai_provider_mode !== "vscode") return;
    const check = () => {
      invoke<boolean>("check_bridge_status").then(setBridgeConnected).catch(() => setBridgeConnected(false));
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [settings.ai_provider_mode]);

  // AI Provider: API key test
  const [keyTestResult, setKeyTestResult] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showKey, setShowKey] = useState(false);

  const testKey = async () => {
    setKeyTestResult("testing");
    try {
      await invoke("test_api_key", { provider: settings.ai_provider, apiKey: settings.ai_api_key });
      setKeyTestResult("success");
    } catch {
      setKeyTestResult("error");
    }
    setTimeout(() => setKeyTestResult("idle"), 3000);
  };

  const formatHotkey = (hotkey: string): string => {
    if (hotkey.toLowerCase() === "fn") return "fn";
    return hotkey
      .replace(/Cmd\+/gi, "\u2318")
      .replace(/Shift\+/gi, "\u21e7")
      .replace(/Alt\+/gi, "\u2325")
      .replace(/Ctrl\+/gi, "\u2303")
      .replace(/Meta\+/gi, "\u2318");
  };

  // Listen for keyboard shortcuts when recording hotkey
  useEffect(() => {
    if (!isRecordingHotkey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setIsRecordingHotkey(false);
        return;
      }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      const parts: string[] = [];
      if (e.metaKey) parts.push(isMac ? "Cmd" : "Meta");
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      parts.push(e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key);
      const newHotkey = parts.join("+");
      invoke("change_hotkey", { hotkey: newHotkey }).catch((e) => console.error("Failed to change hotkey:", e));
      update({ hotkey: newHotkey });
      setIsRecordingHotkey(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isRecordingHotkey, update]);

  return (
    <div
      className="w-full h-screen flex flex-col"
      style={{ background: "var(--background)" }}
    >
      {/* Drag region for title bar */}
      <div
        data-tauri-drag-region
        style={{
          height: isMac ? 28 : 32,
          flexShrink: 0,
        }}
      />

      {/* Header with back arrow + title */}
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
          Settings
        </h2>
      </div>

      {/* Scrollable content */}
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
        {/* General */}
        <SectionCard>
          <SectionHeader>General</SectionHeader>

          <SettingRow label="Hotkey" description="Global shortcut to start recording">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {!isRecordingHotkey ? (
                <button
                  onClick={() => setIsRecordingHotkey(true)}
                  style={{
                    fontWeight: 500,
                    fontSize: 13,
                    color: "var(--yapper-text-primary)",
                    padding: "6px 16px",
                    borderRadius: 10,
                    background: "var(--yapper-surface-low, #f5f5f5)",
                    border: "1px solid var(--yapper-border, #e5e5e5)",
                    cursor: "pointer",
                    letterSpacing: 0.3,
                  }}
                >
                  {formatHotkey(settings.hotkey)}
                </button>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "4px 12px",
                      borderRadius: 8,
                      color: "var(--yapper-accent)",
                      background: "var(--yapper-surface-low)",
                      border: "1px solid var(--yapper-accent)",
                    }}
                  >
                    Press shortcut{"\u2026"}
                  </span>
                  {isMac && (
                    <button
                      onClick={() => {
                        invoke("change_hotkey", { hotkey: "Fn" }).catch((e) => console.error("Failed to change hotkey:", e));
                        update({ hotkey: "Fn" });
                        setIsRecordingHotkey(false);
                        setShowFnTooltip(true);
                      }}
                      style={{
                        fontSize: 10,
                        padding: "3px 8px",
                        borderRadius: 6,
                        color: "var(--yapper-text-secondary)",
                        background: "var(--yapper-surface-low)",
                        border: "1px solid var(--yapper-border)",
                        cursor: "pointer",
                      }}
                    >
                      use fn
                    </button>
                  )}
                </>
              )}
            </div>
          </SettingRow>

          {/* Fn key setup help (macOS) */}
          <AnimatePresence>
            {isMac && showFnTooltip && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: "var(--yapper-surface-low)",
                    border: "1px solid var(--yapper-border)",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--yapper-text-primary)",
                      fontFamily: "var(--font-headline, 'Manrope', sans-serif)",
                    }}>
                      Setup Required
                    </span>
                    <button
                      onClick={() => setShowFnTooltip(false)}
                      style={{ background: "none", border: "none", cursor: "pointer", display: "flex", opacity: 0.5, padding: 2 }}
                    >
                      <X style={{ width: 14, height: 14, color: "var(--yapper-text-secondary)" }} />
                    </button>
                  </div>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--yapper-text-secondary)", marginBottom: 10 }}>
                    To use the <strong style={{ color: "var(--yapper-text-primary)" }}>fn</strong> key, open{" "}
                    <strong style={{ color: "var(--yapper-text-primary)" }}>System Settings → Keyboard</strong> and set{" "}
                    <strong style={{ color: "var(--yapper-text-primary)" }}>"Press 🌐 key to"</strong> to{" "}
                    <strong style={{ color: "var(--yapper-accent)" }}>Do Nothing</strong>.
                  </p>
                  <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--yapper-border)" }}>
                    <img src={fnKeySettingsImg} alt="macOS fn key settings" style={{ width: "100%", display: "block" }} />
                  </div>
                  <p style={{ fontSize: 10, lineHeight: 1.5, color: "var(--yapper-text-secondary)", marginTop: 8, opacity: 0.7 }}>
                    Otherwise macOS will intercept the key for Dictation or Emoji.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ height: 1, background: "var(--yapper-border, #eee)", margin: "2px 0" }} />

          <SettingRow label="Recording mode" description="How the hotkey triggers recording" hint="Press: tap once to start, tap again to stop. Hold: recording stops when you release the key.">
            <div style={{ display: "flex", gap: 4 }}>
              <PillButton
                label="Press"
                selected={settings.recording_mode !== "hold"}
                onClick={() => {
                  invoke("change_recording_mode", { mode: "toggle" }).catch(e => console.error("Failed to change recording mode:", e));
                  update({ recording_mode: "toggle" });
                }}
              />
              <PillButton
                label="Hold"
                selected={settings.recording_mode === "hold"}
                onClick={() => {
                  invoke("change_recording_mode", { mode: "hold" }).catch(e => console.error("Failed to change recording mode:", e));
                  update({ recording_mode: "hold" });
                }}
              />
            </div>
          </SettingRow>

          {!isMac && (
            <SettingRow
              label="STT Engine"
              description="Classic uses system speech; Modern uses enhanced recognition"
            >
              <div style={{ display: "flex", gap: 6 }}>
                <PillButton
                  label="Classic"
                  selected={settings.stt_engine === "classic"}
                  onClick={() => update({ stt_engine: "classic" })}
                />
                <PillButton
                  label="Modern"
                  selected={settings.stt_engine === "modern"}
                  onClick={() => update({ stt_engine: "modern" })}
                />
              </div>
            </SettingRow>
          )}

        </SectionCard>

        {/* AI Provider */}
        <SectionCard>
          <SectionHeader>AI Provider</SectionHeader>

          <SettingRow label="Mode" description="How Yapper calls the AI" hint="VS Code: uses GitHub Copilot through the VS Code extension. API Key: calls Groq or Anthropic directly, no VS Code needed.">
            <div style={{ display: "flex", gap: 4 }}>
              <PillButton
                label="VS Code"
                selected={settings.ai_provider_mode === "vscode"}
                onClick={() => update({ ai_provider_mode: "vscode" })}
              />
              <PillButton
                label="API Key"
                selected={settings.ai_provider_mode === "apikey"}
                onClick={() => update({ ai_provider_mode: "apikey" })}
              />
            </div>
          </SettingRow>

          {settings.ai_provider_mode === "vscode" && (
            <SettingRow
              label="Status"
              description={bridgeConnected === false ? "VS Code extension not detected" : undefined}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: bridgeConnected === null ? "#aaa" : bridgeConnected ? "#34c759" : "#ff3b30",
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--yapper-text-primary)",
                }}>
                  {bridgeConnected === null ? "Checking" : bridgeConnected ? "Connected" : "Disconnected"}
                </span>
                {bridgeConnected === false && (
                  <button
                    onClick={() => invoke("open_vscode").catch(console.error)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--yapper-border, #e5e5e5)",
                      background: "var(--yapper-surface-low, #f5f5f5)",
                      color: "var(--yapper-accent)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Open <ExternalLink style={{ width: 10, height: 10 }} />
                  </button>
                )}
              </div>
            </SettingRow>
          )}

          {settings.ai_provider_mode === "apikey" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SettingRow label="Provider">
                <div style={{ display: "flex", gap: 4 }}>
                  <PillButton
                    label="Groq"
                    selected={settings.ai_provider === "groq"}
                    onClick={() => update({ ai_provider: "groq" })}
                  />
                  <PillButton
                    label="Anthropic"
                    selected={settings.ai_provider === "anthropic"}
                    onClick={() => update({ ai_provider: "anthropic" })}
                  />
                </div>
              </SettingRow>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--yapper-text-primary)" }}>
                  API Key
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.ai_api_key}
                    onChange={(e) => update({ ai_api_key: e.target.value })}
                    placeholder="Paste your API key"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--yapper-border, #ddd)",
                      background: "var(--yapper-surface-low, #f5f5f5)",
                      color: "var(--yapper-text-primary)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--yapper-border, #ddd)",
                      background: "var(--yapper-surface-low, #f5f5f5)",
                      color: "var(--yapper-text-secondary)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={testKey}
                  disabled={keyTestResult === "testing" || !settings.ai_api_key}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: keyTestResult === "success"
                      ? "#34c759"
                      : keyTestResult === "error"
                      ? "#ff3b30"
                      : "#DA7756",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: keyTestResult === "testing" || !settings.ai_api_key ? "not-allowed" : "pointer",
                    opacity: !settings.ai_api_key ? 0.5 : 1,
                    transition: "background 0.2s",
                  }}
                >
                  {keyTestResult === "testing"
                    ? "Testing…"
                    : keyTestResult === "success"
                    ? "Key valid"
                    : keyTestResult === "error"
                    ? "Key invalid"
                    : "Test Key"}
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Style */}
        <SectionCard>
          <SectionHeader>Style</SectionHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--yapper-text-primary)",
              }}
            >
              Default Style
              <HintBubble text="Sets the tone for AI-refined text. Professional for work, Casual for messages, Technical for code discussions, Creative for expressive writing." />
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STYLES.map((s) => (
                <PillButton
                  key={s}
                  label={s}
                  selected={settings.default_style === s}
                  onClick={() => update({ default_style: s })}
                />
              ))}
            </div>
          </div>

          <div
            style={{
              height: 1,
              background: "var(--yapper-border, #eee)",
              margin: "2px 0",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--yapper-text-primary)",
              }}
            >
              Category Overrides
              <HintBubble text="Override the default style for specific categories. For example, set emails to always use Professional tone even if your default is Casual." />
            </span>
            {CATEGORIES.map((cat) => (
              <SettingRow key={cat} label={cat}>
                <StyleDropdown
                  value={settings.style_overrides[cat] || ""}
                  onChange={(val) => updateOverride(cat, val)}
                />
              </SettingRow>
            ))}
          </div>
        </SectionCard>

        {/* Metrics */}
        <SectionCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionHeader>Metrics</SectionHeader>
            <Toggle
              checked={settings.metrics_enabled}
              onChange={(val) => update({ metrics_enabled: val })}
              label="Track metrics"
            />
          </div>
          {settings.metrics_enabled && <MetricsDisplay />}
        </SectionCard>

        {/* Code Mode */}
        <SectionCard>
          <SectionHeader>Code Mode</SectionHeader>
          <SettingRow
            label="Code References"
            description="Include code context in AI refinement"
            hint="When enabled, Yapper sends your workspace file names to the AI so it can preserve code references like function names, variables, and file paths in backtick formatting."
          >
            <Toggle
              checked={settings.code_mode}
              onChange={(val) => update({ code_mode: val })}
              label="Code references"
            />
          </SettingRow>
        </SectionCard>

        {/* Navigation: Dictionary & Snippets */}
        <SectionCard>
          <SectionHeader>Tools</SectionHeader>
          <NavButton
            label="Dictionary"
            icon={<BookOpen style={{ width: 16, height: 16 }} />}
            onClick={onNavigateDictionary}
          />
          <div
            style={{
              height: 1,
              background: "var(--yapper-border, #eee)",
            }}
          />
          <NavButton
            label="Snippets"
            icon={<FileText style={{ width: 16, height: 16 }} />}
            onClick={onNavigateSnippets}
          />
        </SectionCard>
        </div>
      </motion.div>

    </div>
  );
}
