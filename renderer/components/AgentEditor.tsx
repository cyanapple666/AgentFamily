/**
 * Agent 编辑面板 — 增删改 Agent 人格
 */
import { useState } from "react";
import { CloseIcon, PlusIcon, BotIcon, EditIcon } from "./Icons";

interface AgentProfile { id: string; name: string; systemPrompt: string; defaultModel?: string; defaultMode?: string; }
interface Props { agents: AgentProfile[]; onClose: () => void; onAdd: (a: AgentProfile) => void; onUpdate: (a: AgentProfile) => void; onDelete: (id: string) => void; }

const D = "你是一个 AI 助手。简洁高效，直接给答案。";

export default function AgentEditor({ agents, onClose, onAdd, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [draft, setDraft] = useState<AgentProfile>({ id: "", name: "", systemPrompt: D });
  const startNew = () => { const d = { id: "", name: "", systemPrompt: D, defaultModel: "deepseek-v4-pro" }; setDraft(d); setEditing(d); };
  const startEdit = (a: AgentProfile) => { setDraft({ ...a }); setEditing(a); };
  const save = () => { if (!draft.name.trim()) return; const a = { ...draft, id: draft.id || "a_" + Date.now() }; agents.find((x) => x.id === a.id) ? onUpdate(a) : onAdd(a); setEditing(null); };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} className="scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BotIcon size={18} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>Agent 管理</span>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}>
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Agent 列表 */}
        <div style={styles.list}>
          {agents.map((a) => (
            <div key={a.id} style={styles.agentCard} className="fade-in">
              <div style={styles.agentAvatar}>
                <BotIcon size={16} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, fontFamily: "monospace" }}>
                  {a.id} · {a.defaultModel || "V4 Pro"}
                </div>
              </div>
              <button style={styles.editBtn} onClick={() => startEdit(a)}>
                <EditIcon size={12} />
                <span>编辑</span>
              </button>
              <button style={styles.deleteBtn} onClick={() => onDelete(a.id)}>
                删除
              </button>
            </div>
          ))}
          <button style={styles.addBtn} onClick={startNew}>
            <PlusIcon size={14} />
            <span>新建 Agent</span>
          </button>
        </div>

        {/* 编辑弹窗 */}
        {editing !== null && (
          <div style={styles.subOverlay} onClick={() => setEditing(null)}>
            <div style={styles.subModal} className="scale-in" onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <BotIcon size={18} color="var(--accent)" />
                {draft.id ? "编辑" : "新建"} Agent
              </div>

              <label style={styles.label}>名称</label>
              <input
                style={styles.input}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Agent 名称"
              />

              <label style={styles.label}>ID</label>
              <input
                style={{ ...styles.input, opacity: agents.find((a) => a.id === draft.id) ? 0.5 : 1 }}
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="自动生成"
                disabled={!!agents.find((a) => a.id === draft.id)}
              />

              <label style={styles.label}>默认模型</label>
              <select
                style={styles.select}
                value={draft.defaultModel || "deepseek-v4-pro"}
                onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
              >
                <option value="deepseek-v4-flash">V4 Flash</option>
                <option value="deepseek-v4-pro">V4 Pro</option>
                <option value="deepseek-v3.2">V3.2</option>
              </select>

              <label style={styles.label}>System Prompt</label>
              <textarea
                style={{ ...styles.textarea, height: 120 }}
                value={draft.systemPrompt}
                onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
              />

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button style={styles.cancelBtn} onClick={() => setEditing(null)}>取消</button>
                <button style={styles.saveBtn} onClick={save}>保存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
    zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "var(--bg2)", borderRadius: "var(--radius-lg)",
    padding: 0, width: 500, maxHeight: "80vh", overflowY: "auto",
    boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 20px", borderBottom: "1px solid var(--border)",
  },
  list: { padding: "12px 16px" },
  agentCard: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: "var(--radius-sm)",
    background: "var(--bg3)", marginBottom: 6,
    transition: "all var(--transition)",
    border: "1px solid transparent",
  },
  agentAvatar: {
    width: 32, height: 32, borderRadius: "var(--radius-sm)",
    background: "var(--accent-soft)", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  editBtn: {
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 10px", borderRadius: 4,
    border: "none", background: "var(--accent-soft)",
    color: "var(--accent)", cursor: "pointer", fontSize: 11,
    fontWeight: 500, transition: "all var(--transition)",
  },
  deleteBtn: {
    padding: "4px 10px", borderRadius: 4,
    border: "none", background: "transparent",
    color: "var(--danger)", cursor: "pointer", fontSize: 11,
    transition: "all var(--transition)",
  },
  addBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "10px", borderRadius: "var(--radius-sm)",
    border: "1px dashed var(--border2)", background: "transparent",
    color: "var(--text2)", cursor: "pointer", fontSize: 12,
    marginTop: 4, transition: "all var(--transition)",
    fontWeight: 500,
  },
  subOverlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)",
    zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
  },
  subModal: {
    background: "var(--bg2)", borderRadius: "var(--radius-lg)",
    padding: 24, width: 440, boxShadow: "var(--shadow-lg)",
    border: "1px solid var(--border)",
  },
  label: {
    display: "block", fontSize: 11, fontWeight: 500,
    color: "var(--text2)", marginBottom: 4, marginTop: 12,
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  input: {
    width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "var(--bg3)",
    color: "var(--text)", fontSize: 13, outline: "none",
    transition: "border-color var(--transition), box-shadow var(--transition)",
  },
  select: {
    width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "var(--bg3)",
    color: "var(--text)", fontSize: 13, outline: "none",
    transition: "border-color var(--transition)",
  },
  textarea: {
    width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "var(--bg3)",
    color: "var(--text)", fontSize: 12, outline: "none",
    resize: "vertical", fontFamily: "monospace", lineHeight: 1.5,
    transition: "border-color var(--transition), box-shadow var(--transition)",
  },
  cancelBtn: {
    padding: "7px 18px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "transparent",
    color: "var(--text2)", cursor: "pointer", fontSize: 12,
    transition: "all var(--transition)",
  },
  saveBtn: {
    padding: "7px 18px", borderRadius: "var(--radius-sm)",
    border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 12,
    transition: "all var(--transition)", boxShadow: "var(--shadow-accent)",
  },
};

// hover 样式
const agentStyleTag = document.createElement("style");
agentStyleTag.textContent = `
  .agent-card:hover { border-color: var(--border2) !important; background: var(--bg4) !important; }
  .agent-card:hover .agent-delete { opacity: 1 !important; }
  .add-btn:hover { border-color: var(--accent) !important; color: var(--accent) !important; background: var(--accent-soft) !important; }
`;
if (typeof document !== "undefined" && !document.getElementById("agent-styles")) {
  agentStyleTag.id = "agent-styles";
  document.head.appendChild(agentStyleTag);
}
