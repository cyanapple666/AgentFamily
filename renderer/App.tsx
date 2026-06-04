/**
 * agentFamily 桌面应用 — 主组件
 */
import { useState, useEffect, useCallback } from "react";
import ChatPanel from "./components/ChatPanel";
import Sidebar from "./components/Sidebar";
import SettingsPanel from "./components/SettingsPanel";
import FilePanel from "./components/FilePanel";
import AgentEditor from "./components/AgentEditor";
import ObservationPanel, { type OrchestratorState, type TaskStatus } from "./components/ObservationPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import type { DisplayMessage, SessionMeta } from "./types";
import { useT, useLang } from "./i18n";
import {
  AppLogo, SettingsIcon, FolderIcon,
} from "./components/Icons";

const WS_URL = "ws://localhost:3457";
const STORAGE_KEY = "agentfamily_session_id_v2";
const MESSAGES_KEY = "agentfamily_messages_v2";
const THEME_KEY = "agentfamily_theme";
let _msgId = 0;
const uid = () => Date.now() + "_" + (++_msgId);

function loadMessages(): DisplayMessage[] { try { const r = localStorage.getItem(MESSAGES_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveMessages(msgs: DisplayMessage[]) { try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs)); } catch { } }

export default function App() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [messages, setMessages] = useState<DisplayMessage[]>(loadMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<string>("ask");
  const [currentModel, setCurrentModel] = useState<string>("deepseek-v4-pro");
  const [thinkingLevel, setThinkingLevel] = useState<string>("off");
  const [currentAgent, setCurrentAgent] = useState<string>("default");
  const [agentList, setAgentList] = useState<any[]>([]);
  const [permRequest, setPermRequest] = useState<any>(null);
  const [tokenTotal, setTokenTotal] = useState(0);
  const [obsVisible, setObsVisible] = useState(false);
  const [obsState, setObsState] = useState<OrchestratorState>({ phase: "idle", summary: "", reasoning: "", tasks: [] });
  const [fileList, setFileList] = useState<any[]>([]);
  const [filePath, setFilePath] = useState(".");
  const [showFilePanel, setShowFilePanel] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [ctxTokens, setCtxTokens] = useState(0);
  const [skillList, setSkillList] = useState<any[]>([]);
  const [agentSkills, setAgentSkills] = useState<Record<string, string[]>>({});

  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem(THEME_KEY, theme); }, [theme]);

  useEffect(() => {
    const json = JSON.stringify(messages);
    setCtxTokens(Math.round(json.length / 3));
  }, [messages]);

  const handleMessage = useCallback((event: any) => {
    switch (event.type) {
      case "session":
        setSessionId(event.sessionId);
        if (event.sessionId) { localStorage.setItem(STORAGE_KEY, event.sessionId); }
        else { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(MESSAGES_KEY); }
        break;
      case "history": if (event.messages) { setMessages(event.messages.filter((m: any) => m.role === "user" || m.role === "assistant").map((m: any) => { const text = Array.isArray(m.content) ? m.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") : m.content || ""; return { id: uid(), role: m.role, content: text, timestamp: m.timestamp || Date.now(), isStreaming: false } as DisplayMessage; }).filter((m: DisplayMessage) => m.content)); } break;
      case "session_list": setSessions(event.sessions || []); break;
      case "config": setAppConfig(event.config); break;
      case "mode": case "mode_changed": setCurrentMode(event.mode); break;
      case "model": setCurrentModel(event.modelId); break;
      case "thinking": setThinkingLevel(event.level); break;
      case "agent_list": setAgentList(event.agents || []); break;
      case "agent": setCurrentAgent(event.agentId); break;
      case "thinking_delta": setMessages((prev) => { const last = prev[prev.length - 1]; if (last && last.role === "assistant") { return [...prev.slice(0, -1), { ...last, thinking: (last.thinking || "") + event.delta }]; } return [...prev, { id: uid(), role: "assistant", content: "", thinking: event.delta, timestamp: Date.now(), isStreaming: true } as DisplayMessage]; }); break;
      case "text_delta": setMessages((prev) => { const last = prev[prev.length - 1]; if (last && last.role === "assistant" && last.isStreaming) { return [...prev.slice(0, -1), { ...last, content: last.content + event.delta }]; } return [...prev, { id: uid(), role: "assistant", content: event.delta, timestamp: Date.now(), isStreaming: true } as DisplayMessage]; }); break;
      case "tool_start": setMessages((prev) => { const last = prev[prev.length - 1]; if (last && last.role === "assistant") { return [...prev.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls || []), { id: uid(), name: event.name, input: event.input, status: "running" as const }] }]; } return prev; }); break;
      case "tool_end": setMessages((prev) => { const last = prev[prev.length - 1]; if (last && last.role === "assistant" && last.toolCalls) { return [...prev.slice(0, -1), { ...last, toolCalls: last.toolCalls.map((tc: any, i: number, arr: any[]) => i === arr.length - 1 ? { ...tc, status: "success" as const } : tc) }]; } return prev; }); break;
      case "done": setIsStreaming(false); setMessages((prev) => { const last = prev[prev.length - 1]; if (last?.isStreaming) { return [...prev.slice(0, -1), { ...last, isStreaming: false }]; } return prev; }); break;
      case "error": console.error("[WS]", event.message); setIsStreaming(false); break;
      case "token_usage": setTokenTotal((t: number) => t + (event.total || 0)); break;
      case "permission_request": setPermRequest(event); break;
      case "file_list": setFileList(event.files || []); setFilePath(event.currentPath || "."); break;
      case "skill_list": setSkillList(event.skills || []); setAgentSkills(event.agentSkills || {}); break;
      case "orchestrator_event": {
        const evt = (event as any).event || event;
        // ── 更新观察面板状态 ──
        setObsState((prev) => {
          const next = { ...prev };
          switch (evt.type) {
            case "plan_start":
              next.phase = "decomposing";
              next.startedAt = Date.now();
              next.summary = "";
              next.reasoning = "";
              next.tasks = [];
              next.approved = undefined;
              next.reviewSummary = undefined;
              break;
            case "plan_ready":
              next.phase = "executing";
              if (evt.plan) {
                next.summary = evt.plan.summary || "";
                next.reasoning = evt.plan.reasoning || "";
                next.tasks = (evt.plan.tasks || []).map((t: any) => ({
                  id: t.id, title: t.title, type: t.type, status: "pending" as const,
                }));
              }
              break;
            case "task_start":
              next.tasks = next.tasks.map((t) =>
                t.id === evt.taskId ? { ...t, status: "running" as const, startTime: Date.now() } : t
              );
              next.currentTaskId = evt.taskId;
              break;
            case "task_done":
              next.tasks = next.tasks.map((t) =>
                t.id === evt.taskId ? { ...t, status: "done" as const, endTime: Date.now(), reasoning: evt.result?.reasoning, filesWritten: evt.result?.filesWritten } : t
              );
              break;
            case "task_error":
              next.tasks = next.tasks.map((t) =>
                t.id === evt.taskId ? { ...t, status: "failed" as const, endTime: Date.now() } : t
              );
              break;
            case "review_start":
              next.phase = "reviewing";
              next.currentTaskId = undefined;
              break;
            case "review_done":
              next.phase = "done";
              if (evt.result) {
                next.approved = evt.result.approved;
                next.reviewSummary = evt.result.summary;
              }
              break;
          }
          return next;
        });
        // ── 更新聊天消息 ──
        const evtType = evt.type as string;
        const icon = { plan_start: "🔍", plan_ready: "📋", task_start: "⚡", task_done: "✅", task_error: "❌", review_start: "🔎", review_done: "📝", final_answer: "💬" }[evtType] || "ℹ️";
        const label = { plan_start: "开始分析需求...", plan_ready: "任务分解完成", task_start: `执行: ${evt.taskId}`, task_done: `完成: ${evt.taskId}`, task_error: `失败: ${evt.taskId}`, review_start: "开始验收...", review_done: "验收完成", final_answer: "" }[evtType] || evt.type;
        if (evt.type === "plan_delta" || evt.type === "review_delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: last.content + evt.delta }];
            }
            return [...prev, { id: uid(), role: "assistant", content: evt.delta || "", timestamp: Date.now(), isStreaming: true } as DisplayMessage];
          });
        } else if (evt.type === "final_answer") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              return [...prev.slice(0, -1), { ...last, content: evt.content, isStreaming: false }];
            }
            return [...prev, { id: uid(), role: "assistant", content: evt.content, timestamp: Date.now(), isStreaming: false } as DisplayMessage];
          });
        } else if (label) {
          setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: `${icon} ${label}`, timestamp: Date.now(), isStreaming: false } as DisplayMessage]);
        }
        break;
      }
      case "orchestrate_done":
        setIsStreaming(false);
        setObsState((prev) => ({ ...prev, phase: "done" }));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content || event.answer || "", isStreaming: false }];
          }
          if (event.answer) {
            return [...prev, { id: uid(), role: "assistant", content: event.answer, timestamp: Date.now(), isStreaming: false } as DisplayMessage];
          }
          return prev;
        });
        break;
    }
  }, []);

  const { send, connected } = useWebSocket(WS_URL, handleMessage, sessionId);

  useEffect(() => { if (connected) { send({ type: "list_sessions" }); send({ type: "get_config" }); send({ type: "list_agents" }); send({ type: "list_skills" }); send({ type: "list_files", path: "." }); } }, [connected]);

  /**
   * 发送消息处理函数
   * 
   * 处理用户输入，判断是否为编排命令，并发送到服务器
   * 
   * @param content - 用户输入的内容
   */
  const handleSend = useCallback((content: string) => {
    // 空内容或正在流式传输时不发送
    if (!content.trim() || isStreaming) return;

    // 判断是否为编排命令（以 /orchestrate 开头）
    const isOrchestrate = content.trimStart().startsWith("/orchestrate");
    // 提取实际内容（去掉 /orchestrate 前缀）
    const actualContent = isOrchestrate ? content.trimStart().slice("/orchestrate".length).trim() : content;

    // 添加用户消息到消息列表
    setMessages((prev) => [...prev, { id: uid(), role: "user", content, timestamp: Date.now(), isStreaming: false } as DisplayMessage]);
    setIsStreaming(true);

    if (isOrchestrate) {
      // 重置观察面板状态
      setObsState({ phase: "idle", summary: "", reasoning: "", tasks: [] });
      // 显示观察面板
      setObsVisible(true);
      // 发送编排命令到服务器
      send({ type: "orchestrate", content: actualContent });
    } else {
      // 发送普通对话消息
      send({ type: "prompt", content });
    }
  }, [send, isStreaming]);
  const handleSwitchSession = useCallback((id: string) => { localStorage.setItem(STORAGE_KEY, id); setSessionId(id); setMessages([]); send({ type: "switch_session", sessionId: id }); }, [send]);
  const handleNewSession = useCallback(() => { localStorage.removeItem(STORAGE_KEY); setSessionId(""); setMessages([]); setObsState({ phase: "idle", summary: "", reasoning: "", tasks: [] }); send({ type: "switch_session", sessionId: "" }); }, [send]);

  const inputRef = useCallback((node: HTMLInputElement | null) => {
    (window as any).__afInput = node;
  }, []);

  return (
    <div style={s.container}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* 侧边栏 */}
        <Sidebar
          sessions={sessions}
          currentId={sessionId}
          onSwitch={handleSwitchSession}
          onNew={handleNewSession}
          onRename={(id, t) => send({ type: "rename_session", sessionId: id, title: t })}
          onArchive={(id) => send({ type: "archive_session", sessionId: id })}
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          obsState={obsState}
          obsVisible={obsVisible}
          onObsToggle={() => setObsVisible((v) => !v)}
        />

        {/* 主区域 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header */}
          <header style={s.header(showFilePanel)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {!sidebarOpen && (
                <button className="icon-btn" onClick={() => setSidebarOpen(true)} title={t("sessions")} style={{ marginRight: 2, appRegion: "no-drag" } as any}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
                  </svg>
                </button>
              )}
              <AppLogo size={24} />
              <span style={s.logo}>agentFamily</span>
              <select
                value={currentAgent}
                onChange={(e) => { setCurrentAgent(e.target.value); send({ type: "switch_agent", agentId: e.target.value }); }}
                className="header-select"
              >
                {agentList.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                {agentList.length === 0 && <option value="default">Default</option>}
              </select>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                className="icon-btn"
                onClick={() => { setShowFilePanel((v) => !v); if (!showFilePanel) send({ type: "list_files", path: "." }); }}
                title="文件"
                style={{ ...(showFilePanel ? { background: "var(--accent-soft)", color: "var(--accent)" } : {}), appRegion: "no-drag" } as any}
              >
                <FolderIcon size={16} />
              </button>
              <button
                className="icon-btn"
                onClick={() => { send({ type: "get_config" }); setSettingsOpen(true); }}
                title="设置"
                style={{ appRegion: "no-drag" } as any}
              >
                <SettingsIcon size={16} />
              </button>
              <div style={s.statusDot(connected)} title={connected ? "已连接" : "未连接"} />
            </div>
          </header>



          {/* 聊天区域 */}
          <main style={s.main}>
            <ChatPanel messages={messages} isStreaming={isStreaming} />
          </main>

          {/* 输入区 */}
          <footer style={s.footer}>
            <div style={s.inputWrapper}>
              <input
                ref={inputRef}
                style={s.input}
                placeholder={t("inputPlaceholder")}
                disabled={!connected || isStreaming}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
              />
            </div>
            <div style={s.footerBar}>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={currentModel} onChange={(e) => { setCurrentModel(e.target.value); send({ type: "set_model", modelId: e.target.value }); }} className="footer-select">
                  <option value="deepseek-v4-flash">V4 Flash</option><option value="deepseek-v4-pro">V4 Pro</option><option value="deepseek-v3.2">V3.2</option>
                </select>
                <select value={currentMode} onChange={(e) => { setCurrentMode(e.target.value); send({ type: "set_mode", mode: e.target.value }); }} className="footer-select">
                  <option value="readonly">{t("readonly")}</option><option value="ask">{t("ask")}</option><option value="auto">{t("auto")}</option>
                </select>
                <select value={thinkingLevel} onChange={(e) => { setThinkingLevel(e.target.value); send({ type: "set_thinking", level: e.target.value }); }} className="footer-select">
                  <option value="off">{t("thinkOff")}</option><option value="minimal">{t("thinkMin")}</option><option value="low">{t("thinkLow")}</option><option value="medium">{t("thinkMed")}</option><option value="high">{t("thinkHigh")}</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {tokenTotal > 0 && (
                  <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "monospace" }}>
                    {tokenTotal >= 1000 ? (tokenTotal / 1000).toFixed(1) + "k" : tokenTotal} tk
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10, fontFamily: "monospace",
                    color: ctxTokens > 110000 ? "var(--danger)" : ctxTokens > 80000 ? "var(--warning)" : "var(--text3)",
                    fontWeight: ctxTokens > 80000 ? 600 : 400,
                  }}
                  title={"Context: " + ctxTokens + " tokens"}
                >
                  {ctxTokens >= 1000 ? (ctxTokens / 1000).toFixed(0) + "k" : ctxTokens} / 128k
                </span>
                <button
                  style={{ ...s.sendBtn, opacity: connected && !isStreaming ? 1 : 0.5 }}
                  disabled={!connected || isStreaming}
                  onClick={() => { const i = (window as any).__afInput; if (i) { handleSend(i.value); i.value = ""; } }}
                >
                  {t("send")}
                </button>
              </div>
            </div>
          </footer>
        </div>

        {/* 文件面板 */}
        {showFilePanel && (
          <FilePanel
            files={fileList}
            currentPath={filePath}
            onNavigate={(dir: string) => send({ type: "list_files", path: dir })}
            onFileClick={(fp: string) => { const i = (window as any).__afInput; if (i) { i.value = i.value ? i.value + " @" + fp : "@" + fp; i.focus(); } }}
            onClose={() => setShowFilePanel(false)}
          />
        )}
      </div>

      {/* 弹窗 */}
      {settingsOpen && (
        <SettingsPanel
          config={appConfig}
          skills={skillList}
          agentSkills={agentSkills}
          onClose={() => setSettingsOpen(false)}
          onSave={(cfg: any) => send({ type: "set_config", config: cfg })}
          onInstallSkill={(s: any) => send({ type: "install_skill", skill: s })}
          onRemoveSkill={(id: string) => send({ type: "remove_skill", skillId: id })}
          onToggleSkill={(skillId: string, agentId: string, enabled: boolean) => send({ type: "toggle_skill", skillId, agentId, enabled })}
        />
      )}

      {/* 权限请求弹窗 */}
      {permRequest && (
        <div style={ps.overlay} className="fade-in">
          <div style={ps.box} className="scale-in">
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: "var(--text)" }}>{t("permission")}</div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--text2)" }}>
              Tool: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{permRequest.toolName}</span>
            </div>
            <div style={{ marginBottom: 18, fontSize: 11, opacity: 0.5, wordBreak: "break-all", fontFamily: "monospace", padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "var(--bg3)" }}>
              {JSON.stringify(permRequest.params ?? {}).slice(0, 120)}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={ps.deny} onClick={() => { send({ type: "permission_response", allowed: false }); setPermRequest(null); }}>{t("deny")}</button>
              <button style={ps.allow} onClick={() => { send({ type: "permission_response", allowed: true }); setPermRequest(null); }}>{t("allow")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, any> = {
  container: { display: "flex", flexDirection: "column", height: "100vh" },
  header: (showFilePanel: boolean) => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    paddingRight: showFilePanel ? 16 : 150,
    borderBottom: "1px solid var(--border)",
    background: "var(--bg2)",
    minHeight: 48,
    appRegion: "drag" as any,
  }),
  logo: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  statusDot: (connected: boolean) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: connected ? "var(--success)" : "var(--danger)",
    boxShadow: connected ? "0 0 6px var(--success)" : "0 0 6px var(--danger)",
    marginLeft: 6,
  }),
  help: {
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg3)",
    fontSize: 12,
  },
  helpGrid: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 12 },
  helpKey: { fontWeight: 600, color: "var(--accent)", fontFamily: "monospace", fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--accent-soft)" },
  helpVal: { color: "var(--text2)", opacity: 0.7 },
  main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
  footer: {
    padding: "8px 20px 12px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg2)",
  },
  inputWrapper: {},
  input: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border2)",
    background: "var(--input-bg)",
    color: "var(--text)",
    fontSize: 13.5,
    outline: "none",
    transition: "border-color var(--transition), box-shadow var(--transition)",
  },
  footerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sendBtn: {
    padding: "7px 20px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 600,
    transition: "all var(--transition)",
    boxShadow: "var(--shadow-accent)",
  },
};

const ps: Record<string, any> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
  box: { background: "var(--bg2)", borderRadius: "var(--radius-lg)", padding: 24, width: 420, boxShadow: "var(--shadow-lg)", color: "var(--text)", border: "1px solid var(--border)" },
  allow: { padding: "8px 22px", borderRadius: "var(--radius-sm)", border: "none", background: "linear-gradient(135deg, #34d399, #10b981)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all var(--transition)" },
  deny: { padding: "8px 22px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", cursor: "pointer", fontSize: 13, transition: "all var(--transition)" },
};

// 全局样式补丁
const globalStyleTag = document.createElement("style");
globalStyleTag.textContent = `
  .header-select {
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    border: 1px solid var(--border2);
    background: var(--bg3);
    color: var(--text);
    cursor: pointer;
    outline: none;
    font-weight: 600;
    transition: border-color var(--transition);
  }
  .header-select:hover { border-color: var(--accent); }
  .header-select:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

  .footer-select {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    border: 1px solid var(--border2);
    background: var(--bg3);
    color: var(--text2);
    cursor: pointer;
    outline: none;
    transition: all var(--transition);
  }
  .footer-select:hover { border-color: var(--accent); color: var(--text); }
  .footer-select:focus { border-color: var(--accent); }

  input:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 3px var(--accent-soft) !important;
  }
  input::placeholder { color: var(--text3); }

  button:hover { transition: all var(--transition); }
`;
if (typeof document !== "undefined" && !document.getElementById("global-styles")) {
  globalStyleTag.id = "global-styles";
  document.head.appendChild(globalStyleTag);
}
