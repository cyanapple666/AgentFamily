import { useState } from "react";
import type { SessionMeta } from "../types";
import type { OrchestratorState } from "./ObservationPanel";
import type React from "react";
import { useT } from "../i18n";
import { MenuIcon, CloseIcon, PlusIcon, MessageIcon, EditIcon, ArchiveIcon } from "./Icons";
import ObservationPanel from "./ObservationPanel";

interface Props {
  sessions: SessionMeta[]; currentId: string;
  onSwitch: (id: string) => void; onNew: () => void;
  onRename: (id: string, title: string) => void; onArchive: (id: string) => void;
  collapsed: boolean; onToggle: () => void;
  obsState: OrchestratorState;
  obsVisible: boolean;
  onObsToggle: () => void;
}

export default function Sidebar({ sessions, currentId, onSwitch, onNew, onRename, onArchive, collapsed, onToggle, obsState, obsVisible, onObsToggle }: Props) {
  const t = useT();
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (s: SessionMeta) => { setEditId(s.id); setEditVal(s.title); };
  const saveEdit = () => { if (editId && editVal.trim()) { onRename(editId, editVal.trim()); } setEditId(null); };

  const active = sessions.filter((s) => !s.archived);
  const archived = sessions.filter((s) => s.archived);

  if (collapsed) return null;

  const renderItem = (s: SessionMeta) => {
    const isActive = s.id === currentId;
    return (
      <div
        key={s.id}
        className="slide-in"
        style={{
          ...st.item,
          background: isActive ? "var(--accent-soft)" : "transparent",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        }}
        onClick={() => onSwitch(s.id)}
      >
        <MessageIcon size={14} color={isActive ? "var(--accent)" : "var(--text3)"} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editId === s.id ? (
            <input
              style={st.editInput}
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div style={{ ...st.title, color: isActive ? "var(--text)" : "var(--text2)" }}>{s.title.slice(0, 25) || "Untitled"}</div>
              <div style={st.time}>{new Date(s.updatedAt).toLocaleDateString("zh-CN")}</div>
            </>
          )}
        </div>
        {!isActive && (
          <div style={st.actions}>
            <button style={st.btn} onClick={(e) => { e.stopPropagation(); startEdit(s); }} title="Rename">
              <EditIcon size={12} />
            </button>
            <button style={st.btn} onClick={(e) => { e.stopPropagation(); onArchive(s.id); }} title="Archive">
              <ArchiveIcon size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={st.sidebar} className="fade-in">
      {/* Header */}
      <div style={st.header}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text2)", letterSpacing: "0.03em" }}>{t("sessions")}</span>
        <button className="icon-btn" onClick={onToggle} style={{ width: 24, height: 24 }}>
          <CloseIcon size={14} />
        </button>
      </div>

      {/* 新建按钮 */}
      <button style={st.newBtn} onClick={onNew}>
        <PlusIcon size={14} style={{ marginRight: 6 }} />
        {t("newSession")}
      </button>

      {/* 会话列表 */}
      <div style={st.list}>
        {active.length === 0 && (
          <div style={{ padding: "20px 12px", opacity: 0.35, fontSize: 12, textAlign: "center", lineHeight: 1.6 }}>
            {t("noSessions")}
          </div>
        )}
        {active.map(renderItem)}
        {archived.length > 0 && (
          <>
            <div style={{ padding: "16px 12px 6px", fontSize: 10, opacity: 0.3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t("archived")}
            </div>
            {archived.map(renderItem)}
          </>
        )}
      </div>

      {/* 编排观察窗口 */}
      <ObservationPanel
        state={obsState}
        visible={obsVisible}
        onToggle={onObsToggle}
      />
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  collapsed: {
    width: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRight: "1px solid var(--border)",
    background: "var(--bg2)",
    userSelect: "none",
    transition: "background var(--transition)",
  },
  sidebar: {
    width: 260,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    background: "var(--bg2)",
    overflow: "hidden",
    color: "var(--text)",
    transition: "width var(--transition-slow), background var(--transition-slow)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 14px 10px",
    borderBottom: "1px solid var(--border)",
  },
  newBtn: {
    margin: "10px 12px",
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px dashed var(--border2)",
    background: "transparent",
    color: "var(--text2)",
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all var(--transition)",
    fontWeight: 500,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 6px",
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    marginBottom: 2,
    userSelect: "none",
    transition: "all var(--transition)",
  },
  title: {
    fontSize: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.4,
  },
  time: {
    fontSize: 10,
    opacity: 0.35,
    marginTop: 2,
  },
  actions: {
    display: "flex",
    gap: 2,
    opacity: 0,
    transition: "opacity var(--transition)",
    flexShrink: 0,
    paddingTop: 2,
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 4,
    color: "var(--text3)",
    transition: "all var(--transition)",
  },
  editInput: {
    width: "100%",
    padding: "3px 6px",
    borderRadius: 4,
    border: "1px solid var(--accent)",
    background: "var(--bg3)",
    color: "var(--text)",
    fontSize: 12,
    outline: "none",
  },
};

// 让 hover 时显示 actions（通过 CSS-in-JS 补丁）
const styleTag = document.createElement("style");
styleTag.textContent = `
  [data-sidebar-item]:hover .icon-btn-actions,
  [data-sidebar-item]:hover > div:last-child { opacity: 1 !important; }
  [data-sidebar-item]:hover { background: var(--bg4) !important; }
  .new-btn:hover { border-color: var(--accent) !important; color: var(--accent) !important; background: var(--accent-soft) !important; }
  .icon-btn:hover { background: var(--accent-soft); color: var(--text); }
  .icon-btn:active { transform: scale(0.92); }
  .sidebar-btn:hover { background: var(--bg5) !important; color: var(--text) !important; }
  .sidebar-btn:hover svg { color: var(--text) !important; }
`;
if (typeof document !== "undefined" && !document.getElementById("sidebar-styles")) {
  styleTag.id = "sidebar-styles";
  document.head.appendChild(styleTag);
}
