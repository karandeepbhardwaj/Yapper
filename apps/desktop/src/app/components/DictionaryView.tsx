import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { DictionaryEntry } from "../lib/types";
import { ItemManagerView } from "./ItemManagerView";

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

  const form = (
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
          aria-label="Save dictionary entry"
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
  );

  return (
    <ItemManagerView
      title="Dictionary"
      items={entries}
      onAdd={handleAdd}
      onDelete={handleDelete}
      onToggleFavorite={() => {}}
      renderItem={(entry: DictionaryEntry) => ({
        primary: entry.shorthand,
        secondary: entry.expansion,
        id: entry.id,
      })}
      form={form}
      showForm={showForm}
      onShowForm={setShowForm}
      isDarkMode={false}
      activeView="dictionary"
      onNavigate={() => onBack()}
      emptyIcon={<BookOpen style={{ width: 22, height: 22, color: "var(--yapper-accent)" }} />}
      emptyMessage={
        <>
          No dictionary entries yet.
          <br />
          Add shorthand expansions to refine your transcripts.
        </>
      }
    />
  );
}
