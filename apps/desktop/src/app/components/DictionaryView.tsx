import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, Trash2, BookOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { DictionaryEntry } from "../lib/types";

const isMac = navigator.platform.toUpperCase().includes("MAC");

interface DictionaryViewProps {
  onBack: () => void;
}

export function DictionaryView({ onBack }: DictionaryViewProps) {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [shorthand, setShorthand] = useState("");
  const [expansion, setExpansion] = useState("");

  const loadEntries = async () => {
    try {
      const result = await invoke<DictionaryEntry[]>("get_all_entries");
      setEntries(result);
    } catch (e) {
      console.error("[Dictionary] Failed to load entries:", e);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleAdd = async () => {
    const s = shorthand.trim();
    const x = expansion.trim();
    if (!s || !x) return;
    try {
      await invoke("add_entry", { shorthand: s, expansion: x, category: "personal" });
      setShorthand("");
      setExpansion("");
      setShowForm(false);
      await loadEntries();
    } catch (e) {
      console.error("[Dictionary] Failed to add entry:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_entry", { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error("[Dictionary] Failed to delete entry:", e);
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
                  placeholder="Shorthand (e.g. brb)"
                  value={shorthand}
                  onChange={(e) => setShorthand(e.target.value)}
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
                <input
                  type="text"
                  placeholder="Expansion (e.g. be right back)"
                  value={expansion}
                  onChange={(e) => setExpansion(e.target.value)}
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
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setShorthand("");
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
                    disabled={!shorthand.trim() || !expansion.trim()}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 8,
                      background: shorthand.trim() && expansion.trim()
                        ? "linear-gradient(145deg, #DA7756 0%, #c4684a 100%)"
                        : "var(--yapper-border)",
                      color: "#fff",
                      border: "none",
                      cursor: shorthand.trim() && expansion.trim() ? "pointer" : "default",
                      opacity: shorthand.trim() && expansion.trim() ? 1 : 0.5,
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
        {entries.length === 0 && !showForm && (
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
              <BookOpen style={{ width: 22, height: 22, color: "var(--yapper-accent)" }} />
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--yapper-text-secondary)",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              No dictionary entries yet.
              <br />
              Add shorthand expansions to refine your transcripts.
            </p>
          </div>
        )}

        {/* Entry list */}
        <AnimatePresence>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
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
                alignItems: "center",
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
                    {entry.shorthand}
                  </span>
                  <span style={{ color: "var(--yapper-text-secondary)", margin: "0 8px" }}>
                    &rarr;
                  </span>
                  <span>{entry.expansion}</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(entry.id)}
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
          Dictionary
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
