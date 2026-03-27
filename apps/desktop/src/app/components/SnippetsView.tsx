import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, Trash2, FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { Snippet } from "../lib/types";

const isMac = navigator.platform.toUpperCase().includes("MAC");

interface SnippetsViewProps {
  onBack: () => void;
}

export function SnippetsView({ onBack }: SnippetsViewProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");

  const loadSnippets = async () => {
    try {
      const result = await invoke<Snippet[]>("get_all_snippets");
      setSnippets(result);
    } catch (e) {
      console.error("[Snippets] Failed to load snippets:", e);
    }
  };

  useEffect(() => {
    loadSnippets();
  }, []);

  const handleAdd = async () => {
    const t = trigger.trim();
    const x = expansion.trim();
    if (!t || !x) return;
    try {
      await invoke("add_snippet", {
        snippet: {
          id: Date.now().toString(),
          trigger: t,
          expansion: x,
          category: "personal",
          createdAt: new Date().toISOString(),
        },
      });
      setTrigger("");
      setExpansion("");
      setShowForm(false);
      await loadSnippets();
    } catch (e) {
      console.error("[Snippets] Failed to add snippet:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_snippet", { id });
      setSnippets((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error("[Snippets] Failed to delete snippet:", e);
    }
  };

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

      {/* Scrollable content */}
      <div
        className="yapper-scroll flex-1 overflow-y-auto"
        style={{
          padding: "12px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Inline add form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--yapper-surface-lowest)",
                  boxShadow: "var(--yapper-card-shadow)",
                  border: "1px solid var(--yapper-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <input
                  type="text"
                  placeholder="Trigger (e.g. /sig)"
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--yapper-border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 13,
                    outline: "none",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                />
                <textarea
                  placeholder="Expansion (e.g. Best regards, ...)"
                  value={expansion}
                  onChange={(e) => setExpansion(e.target.value)}
                  rows={3}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--yapper-border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 13,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setTrigger("");
                      setExpansion("");
                    }}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "6px 14px",
                      borderRadius: 8,
                      background: "var(--background)",
                      color: "var(--yapper-text-secondary)",
                      border: "1px solid var(--yapper-border)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!trigger.trim() || !expansion.trim()}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 8,
                      background: trigger.trim() && expansion.trim()
                        ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
                        : "var(--yapper-border)",
                      color: "#fff",
                      border: "none",
                      cursor: trigger.trim() && expansion.trim() ? "pointer" : "default",
                      opacity: trigger.trim() && expansion.trim() ? 1 : 0.5,
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {snippets.length === 0 && !showForm && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--yapper-surface-lowest)",
                boxShadow: "var(--yapper-card-shadow)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText style={{ width: 22, height: 22, color: "var(--yapper-accent)" }} />
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--yapper-text-secondary)",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              No snippets yet.
              <br />
              Create trigger-based text expansions for quick insertion.
            </p>
          </div>
        )}

        {/* Snippet list */}
        <AnimatePresence>
          {snippets.map((snippet) => (
            <motion.div
              key={snippet.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--yapper-surface-lowest)",
                boxShadow: "var(--yapper-card-shadow)",
                border: "1px solid var(--yapper-border)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--foreground)",
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--yapper-accent)" }}>
                    {snippet.trigger}
                  </span>
                  <span style={{ color: "var(--yapper-text-secondary)", margin: "0 8px" }}>
                    &rarr;
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--yapper-text-secondary)",
                    lineHeight: 1.5,
                    marginTop: 4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {snippet.expansion}
                </div>
              </div>
              <button
                onClick={() => handleDelete(snippet.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 6,
                  color: "var(--yapper-text-secondary)",
                  opacity: 0.4,
                  transition: "opacity 0.15s, color 0.15s",
                  flexShrink: 0,
                  marginTop: 2,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.color = "#e25c5c";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.4";
                  e.currentTarget.style.color = "var(--yapper-text-secondary)";
                }}
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Floating bottom nav bar */}
      <div
        style={{
          margin: "6px 20px 14px",
          padding: "6px",
          borderRadius: 14,
          background: "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)",
          boxShadow: "var(--yapper-accent-bar-shadow)",
          border: "var(--yapper-accent-bar-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
          overflow: "hidden",
        }}
      >
        {/* Isomorphic light overlay */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "50%",
          background: "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 40%)",
          pointerEvents: "none",
          borderRadius: "14px 14px 0 0",
        }} />

        {/* Left: back */}
        <button
          onClick={onBack}
          style={{
            background: "rgba(0,0,0,0.12)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 7,
            borderRadius: 10,
            color: "#fff",
            position: "relative",
            zIndex: 1,
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
        </button>

        {/* Center: title */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1,
          }}
        >
          Snippets
        </span>

        {/* Right: add */}
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: showForm ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 7,
            borderRadius: 10,
            color: "#fff",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}
