import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { Snippet } from "../lib/types";
import { ItemManagerView } from "./ItemManagerView";

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
          aria-label="Save snippet"
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
  );

  return (
    <ItemManagerView
      title="Snippets"
      items={snippets}
      onAdd={handleAdd}
      onDelete={handleDelete}
      onToggleFavorite={() => {}}
      renderItem={(snippet: Snippet) => ({
        primary: snippet.trigger,
        secondary: snippet.expansion,
        id: snippet.id,
      })}
      form={form}
      showForm={showForm}
      onShowForm={setShowForm}
      isDarkMode={false}
      activeView="snippets"
      onNavigate={() => onBack()}
      emptyIcon={<FileText style={{ width: 22, height: 22, color: "var(--yapper-accent)" }} />}
      emptyMessage={
        <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left", width: "100%" }}>
          <span>Say a trigger word and its full text gets pasted instantly, skipping AI.</span>
          <div style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--yapper-surface-low, #f5f5f5)",
            border: "1px solid var(--yapper-border, #eee)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}>
            <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--yapper-accent)", marginBottom: 2 }}>Examples</div>
            <div><strong>/sig</strong> → Best regards, Karan Bhardwaj</div>
            <div><strong>/addr</strong> → 123 Main St, San Francisco, CA</div>
            <div><strong>/zoom</strong> → https://zoom.us/j/your-meeting-id</div>
          </div>
        </div>
      }
    />
  );
}
