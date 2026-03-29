import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const isMac = navigator.platform.toUpperCase().includes("MAC");

interface ItemRendered {
  primary: string;
  secondary: string;
  id: string;
  isFavorite?: boolean;
}

interface ItemManagerViewProps<T> {
  title: string;
  items: T[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  renderItem: (item: T) => ItemRendered;
  form: React.ReactNode;
  showForm: boolean;
  onShowForm: (show: boolean) => void;
  isDarkMode: boolean;
  activeView: string;
  onNavigate: (view: string) => void;
  emptyIcon: React.ReactNode;
  emptyMessage: React.ReactNode;
}

export function ItemManagerView<T>({
  title,
  items,
  onDelete,
  renderItem,
  form,
  showForm,
  onShowForm,
  emptyIcon,
  emptyMessage,
  onNavigate,
}: ItemManagerViewProps<T>) {
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
              {form}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {items.length === 0 && !showForm && (
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
              {emptyIcon}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--yapper-text-secondary)",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              {emptyMessage}
            </p>
          </div>
        )}

        {/* Item list */}
        <AnimatePresence>
          {items.map((item) => {
            const rendered = renderItem(item);
            return (
              <motion.div
                key={rendered.id}
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
                      {rendered.primary}
                    </span>
                    <span style={{ color: "var(--yapper-text-secondary)", margin: "0 8px" }}>
                      &rarr;
                    </span>
                  </div>
                  {rendered.secondary && (
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
                      {rendered.secondary}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onDelete(rendered.id)}
                  aria-label="Delete item"
                  className="delete-btn-hover"
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
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </motion.div>
            );
          })}
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
          onClick={() => onNavigate("history")}
          aria-label="Go back"
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
          {title}
        </span>

        {/* Right: add */}
        <button
          onClick={() => onShowForm(!showForm)}
          aria-label={`Add ${title.toLowerCase()} item`}
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
