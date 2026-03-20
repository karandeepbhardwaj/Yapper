import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { AppSettings } from "../lib/types";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: AppSettings;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
}

export function SettingsDialog({ isOpen, onClose, settings, onUpdateSettings }: SettingsDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-2xl z-50 overflow-hidden"
            style={{
              background: "var(--background)",
              border: "1px solid var(--claude-border)",
            }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{
                borderColor: "var(--claude-border)",
                background: "var(--claude-bg-lighter)",
              }}
            >
              <h2
                className="text-lg"
                style={{
                  color: "var(--claude-text-primary)",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                Settings
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:scale-105 transition-transform"
                style={{
                  background: "var(--claude-bg-light)",
                  border: "1px solid var(--claude-border)",
                }}
              >
                <X className="w-4 h-4" style={{ color: "var(--claude-text-secondary)" }} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm mb-3" style={{ color: "var(--claude-text-primary)" }}>
                  Recording
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--claude-text-secondary)" }}>
                      Auto-stop after silence
                    </span>
                    <input
                      type="checkbox"
                      checked={settings?.autoStopAfterSilence ?? true}
                      onChange={(e) => onUpdateSettings?.({ autoStopAfterSilence: e.target.checked })}
                      className="w-4 h-4 rounded accent-current"
                      style={{ accentColor: "var(--claude-orange)" }}
                    />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--claude-text-secondary)" }}>
                      Show floating widget
                    </span>
                    <input
                      type="checkbox"
                      checked={settings?.showFloatingWidget ?? true}
                      onChange={(e) => onUpdateSettings?.({ showFloatingWidget: e.target.checked })}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--claude-orange)" }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm mb-3" style={{ color: "var(--claude-text-primary)" }}>
                  Transcription
                </h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm mb-2 block" style={{ color: "var(--claude-text-secondary)" }}>
                      Language
                    </span>
                    <select
                      value={settings?.language ?? "en-US"}
                      onChange={(e) => onUpdateSettings?.({ language: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: "var(--claude-bg-lighter)",
                        border: "1px solid var(--claude-border)",
                        color: "var(--claude-text-primary)",
                      }}
                    >
                      <option value="en-US">English</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                      <option value="ja-JP">Japanese</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm mb-2 block" style={{ color: "var(--claude-text-secondary)" }}>
                      Refinement Style
                    </span>
                    <select
                      value={settings?.refinementStyle ?? "Professional"}
                      onChange={(e) => onUpdateSettings?.({ refinementStyle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: "var(--claude-bg-lighter)",
                        border: "1px solid var(--claude-border)",
                        color: "var(--claude-text-primary)",
                      }}
                    >
                      <option>Professional</option>
                      <option>Casual</option>
                      <option>Technical</option>
                      <option>Creative</option>
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm mb-3" style={{ color: "var(--claude-text-primary)" }}>
                  Keyboard Shortcuts
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--claude-text-secondary)" }}>Start/Stop Recording</span>
                    <kbd
                      className="px-2 py-1 rounded"
                      style={{
                        background: "var(--claude-bg-lighter)",
                        border: "1px solid var(--claude-border)",
                        color: "var(--claude-text-primary)",
                      }}
                    >
                      {settings?.hotkey ?? "Cmd+Shift+."}
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--claude-text-secondary)" }}>Open Settings</span>
                    <kbd
                      className="px-2 py-1 rounded"
                      style={{
                        background: "var(--claude-bg-lighter)",
                        border: "1px solid var(--claude-border)",
                        color: "var(--claude-text-primary)",
                      }}
                    >
                      Cmd + ,
                    </kbd>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: "var(--claude-border)" }}>
                <div className="text-xs space-y-1">
                  <p style={{ color: "var(--claude-text-secondary)" }}>Version 1.0.0</p>
                  <p style={{ color: "var(--claude-text-secondary)" }}>© 2026 Prompt Refinement Services</p>
                </div>
              </div>
            </div>

            <div
              className="px-6 py-4 border-t flex justify-end gap-3"
              style={{
                borderColor: "var(--claude-border)",
                background: "var(--claude-bg-lighter)",
              }}
            >
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm transition-all hover:scale-105"
                style={{ background: "var(--claude-orange)", color: "#ffffff" }}
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
