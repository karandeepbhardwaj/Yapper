import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Home, BookOpen, FileText, ChevronRight, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import fnKeySettingsImg from "../../assets/fn-key-settings.png";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, Metrics } from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/types";

function MetricsDisplay() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    invoke<Metrics>("get_metrics").then(setMetrics).catch(() => {});
  }, []);

  if (!metrics) return null;

  const formatWords = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

  const items = [
    { icon: "🔥", value: `${metrics.streakDays}`, label: "day streak" },
    { icon: "🚀", value: formatWords(metrics.totalWords), label: "words" },
    { icon: "🏅", value: `${Math.round(metrics.avgWpm)}`, label: "avg WPM" },
    { icon: "🎙️", value: `${metrics.totalEntries}`, label: "recordings" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {items.map((item) => (
        <span
          key={item.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "5px 10px",
            borderRadius: 8,
            background: "var(--yapper-surface-low)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
            fontSize: 11,
            color: "var(--yapper-text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 12 }}>{item.icon}</span>
          <span style={{ fontWeight: 600, color: "var(--yapper-text-primary)" }}>{item.value}</span>
          {item.label}
        </span>
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
        boxShadow: "var(--yapper-card-shadow)",
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
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

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
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
            fontSize: 13,
            fontWeight: 500,
            color: "var(--yapper-text-primary)",
          }}
        >
          {label}
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
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
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
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 20,
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        background: selected
          ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
          : "var(--yapper-surface-low, #eee)",
        color: selected ? "#fff" : "var(--yapper-text-secondary)",
        boxShadow: selected
          ? "0 2px 8px rgba(218,119,86,0.3)"
          : "none",
        transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
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
        padding: "5px 10px",
        borderRadius: 8,
        border: "1px solid var(--yapper-border, #ddd)",
        background: "var(--yapper-surface-low, #f5f5f5)",
        color: "var(--yapper-text-primary)",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        outline: "none",
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
      invoke("change_hotkey", { hotkey: newHotkey }).catch(() => {});
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

      {/* Centered title */}
      <div style={{ textAlign: "center", marginBottom: 8, flexShrink: 0 }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontWeight: 400,
          fontSize: 30,
          color: "var(--yapper-text-primary)",
          lineHeight: 1,
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
                    fontWeight: 600,
                    fontSize: 12,
                    color: "var(--yapper-text-primary)",
                    padding: "4px 12px",
                    borderRadius: 8,
                    background: "var(--yapper-surface-low, #f0f0f0)",
                    boxShadow: "var(--yapper-card-shadow)",
                    letterSpacing: 0.5,
                    border: "none",
                    cursor: "pointer",
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
                        invoke("change_hotkey", { hotkey: "Fn" }).catch(() => {});
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

        {/* Style */}
        <SectionCard>
          <SectionHeader>Style</SectionHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--yapper-text-secondary)",
              }}
            >
              Default Style
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

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--yapper-text-secondary)",
              }}
            >
              Category Overrides
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
          <SectionHeader>Metrics</SectionHeader>
          <MetricsDisplay />
          <div style={{ marginTop: 12 }}>
            <SettingRow
              label="Track Metrics"
              description="Record word count, speed, and streaks"
            >
              <Toggle
                checked={settings.metrics_enabled}
                onChange={(val) => update({ metrics_enabled: val })}
              />
            </SettingRow>
          </div>
        </SectionCard>

        {/* Code Mode */}
        <SectionCard>
          <SectionHeader>Code Mode</SectionHeader>
          <SettingRow
            label="Code References"
            description="Include code context in AI refinement"
          >
            <Toggle
              checked={settings.code_mode}
              onChange={(val) => update({ code_mode: val })}
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

      {/* Floating back button — bottom left */}
      <motion.button
        onClick={onBack}
        whileHover={{ scale: 1.08, y: -2 }}
        whileTap={{ scale: 0.9 }}
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          zIndex: 50,
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 4px 16px rgba(218,119,86,0.3), 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 1px rgba(0,0,0,0.1)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <Home style={{ width: 16, height: 16, fill: "#fff" }} />
      </motion.button>
    </div>
  );
}
