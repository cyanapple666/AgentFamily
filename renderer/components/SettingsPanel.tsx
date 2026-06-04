/**
 * 设置面板 — 标签页式设计
 * Tab: 外观 | 模型供应商 | 系统提示词 | Agent | 帮助
 */
import { useState, useEffect } from "react";
import { useT, useLang } from "../i18n";
import {
  CloseIcon, SettingsIcon, SunIcon, MoonIcon, GlobeIcon,
  BotIcon, HelpIcon, PlusIcon, EditIcon, ChevronDownIcon,
} from "./Icons";

interface ModelProvider {
  id: string; name: string; baseUrl: string; apiKey: string; models: string[];
}
interface AgentProfile { id: string; name: string; systemPrompt: string; defaultModel?: string; defaultMode?: string; }

interface Config {
  systemPrompt: string;
  agents?: AgentProfile[];
  theme?: string;
  lang?: string;
  modelProviders?: ModelProvider[];
  activeProvider?: string;
  activeModel?: string;
}

interface SkillMeta {
  id: string; name: string; description: string; source: string; enabled: boolean; installedAt: number;
}

interface Props {
  config: Config | null;
  skills: SkillMeta[];
  agentSkills: Record<string, string[]>;
  onClose: () => void;
  onSave: (c: any) => void;
  onInstallSkill: (s: any) => void;
  onRemoveSkill: (id: string) => void;
  onToggleSkill: (skillId: string, agentId: string, enabled: boolean) => void;
}

type Tab = "appearance" | "providers" | "prompt" | "agents" | "skills" | "help";

const TABS: { key: Tab; label: string; zhLabel: string }[] = [
  { key: "appearance", label: "Appearance", zhLabel: "外观" },
  { key: "providers", label: "Providers", zhLabel: "模型供应商" },
  { key: "prompt", label: "Prompt", zhLabel: "提示词" },
  { key: "agents", label: "Agents", zhLabel: "Agent" },
  { key: "skills", label: "Skills", zhLabel: "技能" },
  { key: "help", label: "Help", zhLabel: "帮助" },
];

const D = "你是一个 AI 助手。简洁高效，直接给答案。";

export default function SettingsPanel({ config, skills, agentSkills, onClose, onSave, onInstallSkill, onRemoveSkill, onToggleSkill }: Props) {
  const t = useT();
  const { lang, setLang } = useLang();
  const [draft, setDraft] = useState<Config | null>(null);
  const [tab, setTab] = useState<Tab>("appearance");
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "dark");
  const [editingAgent, setEditingAgent] = useState<AgentProfile | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentProfile>({ id: "", name: "", systemPrompt: D });
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [skillTab, setSkillTab] = useState<"list" | "install">("list");
  const [installUrl, setInstallUrl] = useState("");
  const [installName, setInstallName] = useState("");
  const [installDesc, setInstallDesc] = useState("");
  const [selectedAgentForSkills, setSelectedAgentForSkills] = useState<string>("");

  useEffect(() => { if (config) setDraft({ ...config }); }, [config]);

  const updateDraft = (patch: Partial<Config>) => {
    setDraft((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const handleSave = () => {
    if (draft) onSave(draft);
    onClose();
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("agentfamily_theme", newTheme);
    updateDraft({ theme: newTheme });
  };

  const handleLangChange = (newLang: string) => {
    setLang(newLang as any);
    updateDraft({ lang: newLang });
  };

  // Agent CRUD
  const addAgent = () => {
    const d = { id: "", name: "", systemPrompt: D, defaultModel: "deepseek-v4-pro" };
    setAgentDraft(d);
    setEditingAgent(d);
  };
  const editAgent = (a: AgentProfile) => { setAgentDraft({ ...a }); setEditingAgent(a); };
  const saveAgent = () => {
    if (!agentDraft.name.trim() || !draft) return;
    const a = { ...agentDraft, id: agentDraft.id || "a_" + Date.now() };
    const agents = draft.agents || [];
    const updated = agents.find((x) => x.id === a.id)
      ? agents.map((x) => (x.id === a.id ? a : x))
      : [...agents, a];
    updateDraft({ agents: updated });
    setEditingAgent(null);
  };
  const deleteAgent = (id: string) => {
    if (!draft) return;
    updateDraft({ agents: (draft.agents || []).filter((a) => a.id !== id) });
  };

  // Provider CRUD
  const updateProvider = (id: string, patch: Partial<ModelProvider>) => {
    if (!draft) return;
    updateDraft({
      modelProviders: (draft.modelProviders || []).map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
  };
  const addProvider = () => {
    if (!draft) return;
    const newP: ModelProvider = { id: "custom_" + Date.now(), name: "新供应商", baseUrl: "", apiKey: "", models: [""] };
    updateDraft({ modelProviders: [...(draft.modelProviders || []), newP] });
    setExpandedProvider(newP.id);
  };
  const removeProvider = (id: string) => {
    if (!draft) return;
    updateDraft({
      modelProviders: (draft.modelProviders || []).filter((p) => p.id !== id),
      activeProvider: draft.activeProvider === id ? "deepseek" : draft.activeProvider,
    });
  };

  if (!draft) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} className="scale-in" onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 24, height: 24, border: "2px solid var(--border2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        </div>
      </div>
    );
  }

  const currentProviders = draft.modelProviders || [];
  const currentAgentList = draft.agents || [];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} className="scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SettingsIcon size={18} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>设置</span>
          </div>
          <button className="icon-btn" onClick={handleSave} style={{ width: 28, height: 28 }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div style={styles.body}>
          {/* Tab 侧栏 */}
          <div style={styles.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.key}
                style={{
                  ...styles.tabItem,
                  background: tab === t.key ? "var(--accent-soft)" : "transparent",
                  color: tab === t.key ? "var(--accent)" : "var(--text2)",
                  borderLeft: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onClick={() => setTab(t.key)}
              >
                {t.zhLabel}
              </button>
            ))}
          </div>

          {/* Tab 内容 */}
          <div style={styles.tabContent}>
            {/* ── 外观 ── */}
            {tab === "appearance" && (
              <div className="fade-in">
                <SectionTitle>主题</SectionTitle>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <ThemeCard active={theme === "dark"} onClick={() => handleThemeChange("dark")} icon={<MoonIcon size={18} color={theme === "dark" ? "#fff" : "var(--text3)"} />} label="深色" />
                  <ThemeCard active={theme === "light"} onClick={() => handleThemeChange("light")} icon={<SunIcon size={18} color={theme === "light" ? "#000" : "var(--text3)"} />} label="浅色" />
                </div>

                <SectionTitle>语言</SectionTitle>
                <div style={{ display: "flex", gap: 8 }}>
                  <LangBtn active={lang === "zh"} onClick={() => handleLangChange("zh")}>中文</LangBtn>
                  <LangBtn active={lang === "en"} onClick={() => handleLangChange("en")}>English</LangBtn>
                </div>
              </div>
            )}

            {/* ── 模型供应商 ── */}
            {tab === "providers" && (
              <div className="fade-in">
                <SectionTitle>当前模型</SectionTitle>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <select
                    style={styles.select}
                    value={draft.activeProvider || "deepseek"}
                    onChange={(e) => updateDraft({ activeProvider: e.target.value })}
                  >
                    {currentProviders.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    style={styles.select}
                    value={draft.activeModel || "deepseek-v4-pro"}
                    onChange={(e) => updateDraft({ activeModel: e.target.value })}
                  >
                    {currentProviders.find((p) => p.id === draft.activeProvider)?.models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    )) || <option value="deepseek-v4-pro">deepseek-v4-pro</option>}
                  </select>
                </div>

                <SectionTitle>供应商配置</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentProviders.map((p) => (
                    <div key={p.id} style={styles.providerCard}>
                      <div
                        style={styles.providerHeader}
                        onClick={() => setExpandedProvider(expandedProvider === p.id ? null : p.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: p.apiKey ? "var(--success)" : "var(--text3)",
                          }} />
                          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{p.name}</span>
                          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "monospace" }}>{p.models.length} models</span>
                        </div>
                        <ChevronDownIcon
                          size={14}
                          color="var(--text3)"
                          style={{
                            transition: "transform var(--transition)",
                            transform: expandedProvider === p.id ? "rotate(0deg)" : "rotate(-90deg)",
                          }}
                        />
                      </div>
                      {expandedProvider === p.id && (
                        <div style={styles.providerBody} className="fade-in">
                          <FieldLabel>名称</FieldLabel>
                          <input style={styles.input} value={p.name} onChange={(e) => updateProvider(p.id, { name: e.target.value })} />
                          <FieldLabel>Base URL</FieldLabel>
                          <input style={styles.input} value={p.baseUrl} onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
                          <FieldLabel>API Key</FieldLabel>
                          <input style={styles.input} type="password" value={p.apiKey} onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })} placeholder="sk-..." />
                          <FieldLabel>可用模型（每行一个）</FieldLabel>
                          <textarea
                            style={{ ...styles.textarea, height: 80 }}
                            value={p.models.join("\n")}
                            onChange={(e) => updateProvider(p.id, { models: e.target.value.split("\n").filter(Boolean) })}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <button style={styles.dangerBtn} onClick={() => removeProvider(p.id)}>删除供应商</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button style={styles.addBtn} onClick={addProvider}>
                  <PlusIcon size={14} />
                  <span>添加供应商</span>
                </button>
              </div>
            )}

            {/* ── 系统提示词 ── */}
            {tab === "prompt" && (
              <div className="fade-in">
                <SectionTitle>System Prompt（人格设定）</SectionTitle>
                <textarea
                  style={{ ...styles.textarea, height: 360 }}
                  value={draft.systemPrompt}
                  onChange={(e) => updateDraft({ systemPrompt: e.target.value })}
                  spellCheck={false}
                  placeholder="定义 Agent 的行为和人格..."
                />
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6, opacity: 0.5 }}>
                  保存后，新建的对话将使用新设置
                </div>
              </div>
            )}

            {/* ── Agent ── */}
            {tab === "agents" && (
              <div className="fade-in">
                <SectionTitle>Agent 管理</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentAgentList.map((a) => (
                    <div key={a.id} style={styles.agentCard}>
                      <div style={styles.agentAvatar}>
                        <BotIcon size={16} color="var(--accent)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, fontFamily: "monospace" }}>
                          {a.id} · {a.defaultModel || "V4 Pro"}
                        </div>
                      </div>
                      <button style={styles.editBtn} onClick={() => editAgent(a)}>
                        <EditIcon size={12} />
                        <span>编辑</span>
                      </button>
                      <button style={styles.deleteBtn} onClick={() => deleteAgent(a.id)}>删除</button>
                    </div>
                  ))}
                </div>
                <button style={styles.addBtn} onClick={addAgent}>
                  <PlusIcon size={14} />
                  <span>新建 Agent</span>
                </button>
              </div>
            )}

            {/* ── 技能 ── */}
            {tab === "skills" && (
              <div className="fade-in">
                {/* 子标签：已安装 / 安装 */}
                <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
                  <button
                    onClick={() => setSkillTab("list")}
                    style={{
                      padding: "6px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                      background: "transparent", color: skillTab === "list" ? "var(--accent)" : "var(--text2)",
                      borderBottom: skillTab === "list" ? "2px solid var(--accent)" : "2px solid transparent",
                      transition: "all var(--transition)",
                    }}
                  >
                    已安装 ({skills.length})
                  </button>
                  <button
                    onClick={() => setSkillTab("install")}
                    style={{
                      padding: "6px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                      background: "transparent", color: skillTab === "install" ? "var(--accent)" : "var(--text2)",
                      borderBottom: skillTab === "install" ? "2px solid var(--accent)" : "2px solid transparent",
                      transition: "all var(--transition)",
                    }}
                  >
                    安装新技能
                  </button>
                </div>

                {/* 已安装列表 */}
                {skillTab === "list" && (
                  <>
                    {/* Agent 选择器 */}
                    <SectionTitle>为 Agent 配置技能</SectionTitle>
                    <select
                      style={{ ...styles.select, width: "100%", marginBottom: 12 }}
                      value={selectedAgentForSkills}
                      onChange={(e) => setSelectedAgentForSkills(e.target.value)}
                    >
                      <option value="">选择 Agent 查看/编辑其技能</option>
                      {(draft?.agents || []).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>

                    {/* 技能列表 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {skills.length === 0 && (
                        <div style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 12, opacity: 0.5 }}>
                          暂无已安装技能，点击「安装新技能」添加
                        </div>
                      )}
                      {skills.map((s) => {
                        const isEnabled = selectedAgentForSkills
                          ? (agentSkills[selectedAgentForSkills] || []).includes(s.id)
                          : s.enabled;
                        return (
                          <div key={s.id} style={styles.skillCard}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{s.name}</span>
                                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--bg4)", color: "var(--text3)", fontFamily: "monospace" }}>{s.source === "local" ? "local" : "github"}</span>
                              </div>
                              {s.description && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{s.description}</div>}
                            </div>
                            {selectedAgentForSkills && (
                              <label style={styles.toggle}>
                                <input
                                  type="checkbox"
                                  checked={isEnabled}
                                  onChange={(e) => onToggleSkill(s.id, selectedAgentForSkills, e.target.checked)}
                                  style={{ display: "none" }}
                                />
                                <div style={{
                                  width: 34, height: 18, borderRadius: 9, cursor: "pointer", position: "relative",
                                  background: isEnabled ? "var(--accent)" : "var(--bg5)",
                                  transition: "background var(--transition)",
                                }}>
                                  <div style={{
                                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                                    position: "absolute", top: 2, left: isEnabled ? 18 : 2,
                                    transition: "left var(--transition)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                  }} />
                                </div>
                              </label>
                            )}
                            <button style={styles.deleteBtn} onClick={() => onRemoveSkill(s.id)}>删除</button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* 安装新技能 */}
                {skillTab === "install" && (
                  <div>
                    <SectionTitle>从 GitHub 安装</SectionTitle>
                    <FieldLabel>仓库 URL</FieldLabel>
                    <input
                      style={styles.input}
                      value={installUrl}
                      onChange={(e) => setInstallUrl(e.target.value)}
                      placeholder="https://github.com/user/repo"
                    />
                    <FieldLabel>技能名称</FieldLabel>
                    <input
                      style={styles.input}
                      value={installName}
                      onChange={(e) => setInstallName(e.target.value)}
                      placeholder="my-skill"
                    />
                    <FieldLabel>描述（可选）</FieldLabel>
                    <input
                      style={styles.input}
                      value={installDesc}
                      onChange={(e) => setInstallDesc(e.target.value)}
                      placeholder="这个技能做什么"
                    />
                    <button
                      style={{ ...styles.saveBtn, marginTop: 14, width: "100%" }}
                      onClick={() => {
                        if (!installName.trim()) return;
                        onInstallSkill({
                          id: installName.trim().toLowerCase().replace(/\s+/g, "-"),
                          name: installName.trim(),
                          description: installDesc.trim(),
                          source: installUrl.trim() || "local",
                        });
                        setInstallName(""); setInstallUrl(""); setInstallDesc("");
                        setSkillTab("list");
                      }}
                    >
                      安装
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── 帮助 ── */}
            {tab === "help" && (
              <div className="fade-in">
                <SectionTitle>快捷操作</SectionTitle>
                <div style={styles.helpGrid}>
                  <HelpKey>Enter</HelpKey><HelpVal>发送消息</HelpVal>
                  <HelpKey>Shift + Enter</HelpKey><HelpVal>换行</HelpVal>
                  <HelpKey>侧边栏</HelpKey><HelpVal>切换历史会话</HelpVal>
                  <HelpKey>设置 → 模型供应商</HelpKey><HelpVal>配置 API Key 和模型</HelpVal>
                  <HelpKey>设置 → Agent</HelpKey><HelpVal>管理 Agent 人格</HelpVal>
                </div>
                <SectionTitle style={{ marginTop: 20 }}>SubAgent 多智能体协作</SectionTitle>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.8 }}>
                  <p>SubAgent 是 agentFamily 的核心能力，可以把一个复杂需求拆解成多个子任务，由不同的 Agent 并行执行。</p>
                  <p style={{ marginTop: 8 }}><strong style={{ color: "var(--accent)" }}>工作流程</strong></p>
                  <div style={{ background: "var(--bg3)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginTop: 6, fontFamily: "monospace", fontSize: 11 }}>
                    <div>1. <strong>分解</strong> — 分析需求，拆成可并行的子任务</div>
                    <div>2. <strong>契约</strong> — 定义子任务间的接口协议</div>
                    <div>3. <strong>执行</strong> — 多个 SubAgent 并行处理各自任务</div>
                    <div>4. <strong>验收</strong> — 检查一致性、冲突、规范</div>
                  </div>
                  <p style={{ marginTop: 8 }}><strong style={{ color: "var(--accent)" }}>任务类型</strong></p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {"frontend,backend,ui,test,docs,config".split(",").map((t) => (
                      <span key={t} style={{ padding: "2px 8px", borderRadius: 4, background: "var(--bg4)", fontSize: 10, fontFamily: "monospace", color: "var(--text2)" }}>{t}</span>
                    ))}
                  </div>
                  <p style={{ marginTop: 8 }}><strong style={{ color: "var(--accent)" }}>使用方式</strong></p>
                  <p>在聊天中输入复杂需求，系统会自动判断是否需要拆解。也可以用前缀 <code style={{ background: "var(--bg4)", padding: "1px 5px", borderRadius: 3, fontFamily: "monospace", fontSize: 11 }}>/orchestrate</code> 强制触发。</p>
                  <p style={{ marginTop: 4 }}><strong style={{ color: "var(--accent)" }}>适用场景</strong></p>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    <li>需要前后端同时开发的功能</li>
                    <li>涉及多个文件的重构</li>
                    <li>需要测试 + 文档同步完成的任务</li>
                  </ul>
                  <p style={{ marginTop: 4 }}><strong style={{ color: "var(--warning)" }}>注意事项</strong></p>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    <li>每次调用会消耗多次 API 请求，注意 token 用量</li>
                    <li>简单任务（改一个文件）不需要用 SubAgent，直接对话更快</li>
                    <li>SubAgent 之间通过契约协调，复杂交互建议拆成更小的契约</li>
                  </ul>
                </div>

                <SectionTitle style={{ marginTop: 20 }}>关于</SectionTitle>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.8 }}>
                  <p>agentFamily 是一个基于 Pi SDK 的 AI Agent 开发项目。</p>
                  <p style={{ marginTop: 4 }}>支持多 Agent 协作、记忆系统和桌面应用。</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={{ fontSize: 11, color: "var(--text3)", opacity: 0.5 }}>设置会自动保存到本地</span>
          <button style={styles.saveBtn} onClick={handleSave}>完成</button>
        </div>

        {/* Agent 编辑弹窗 */}
        {editingAgent !== null && (
          <div style={styles.subOverlay} onClick={() => setEditingAgent(null)}>
            <div style={styles.subModal} className="scale-in" onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <BotIcon size={18} color="var(--accent)" />
                {agentDraft.id ? "编辑" : "新建"} Agent
              </div>
              <FieldLabel>名称</FieldLabel>
              <input style={styles.input} value={agentDraft.name} onChange={(e) => setAgentDraft({ ...agentDraft, name: e.target.value })} placeholder="Agent 名称" />
              <FieldLabel>ID</FieldLabel>
              <input
                style={{ ...styles.input, opacity: currentAgentList.find((a) => a.id === agentDraft.id) ? 0.5 : 1 }}
                value={agentDraft.id}
                onChange={(e) => setAgentDraft({ ...agentDraft, id: e.target.value })}
                placeholder="自动生成"
                disabled={!!currentAgentList.find((a) => a.id === agentDraft.id)}
              />
              <FieldLabel>默认模型</FieldLabel>
              <select style={styles.select} value={agentDraft.defaultModel || "deepseek-v4-pro"} onChange={(e) => setAgentDraft({ ...agentDraft, defaultModel: e.target.value })}>
                {currentProviders.find((p) => p.id === draft.activeProvider)?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                )) || <option value="deepseek-v4-pro">deepseek-v4-pro</option>}
              </select>
              <FieldLabel>System Prompt</FieldLabel>
              <textarea style={{ ...styles.textarea, height: 120 }} value={agentDraft.systemPrompt} onChange={(e) => setAgentDraft({ ...agentDraft, systemPrompt: e.target.value })} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button style={styles.cancelBtn} onClick={() => setEditingAgent(null)}>取消</button>
                <button style={styles.saveBtn} onClick={saveAgent}>保存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 子组件 ──
function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, ...style }}>{children}</div>;
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text2)", marginBottom: 4, marginTop: 10 }}>{children}</label>;
}
function HelpKey({ children }: { children: React.ReactNode }) {
  return <span style={{ fontWeight: 600, color: "var(--accent)", fontFamily: "monospace", fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--accent-soft)" }}>{children}</span>;
}
function HelpVal({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--text2)", fontSize: 12 }}>{children}</span>;
}
function ThemeCard({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "14px 20px", borderRadius: "var(--radius-sm)", cursor: "pointer",
        border: active ? "2px solid var(--accent)" : "2px solid var(--border2)",
        background: active ? "var(--accent-soft)" : "var(--bg3)",
        transition: "all var(--transition)", flex: 1,
      }}
    >
      {icon}
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "var(--accent)" : "var(--text2)" }}>{label}</span>
    </button>
  );
}
function LangBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, fontWeight: 500,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border2)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text2)",
        transition: "all var(--transition)",
      }}
    >
      {children}
    </button>
  );
}

// ── 样式 ──
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
    zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "var(--bg2)", borderRadius: "var(--radius-lg)",
    width: 680, maxHeight: "85vh", overflow: "hidden",
    boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
    display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0,
  },
  body: {
    display: "flex", flex: 1, overflow: "hidden",
  },
  tabBar: {
    width: 140, borderRight: "1px solid var(--border)",
    padding: "8px 0", flexShrink: 0, overflowY: "auto",
  },
  tabItem: {
    display: "block", width: "100%", padding: "8px 14px",
    border: "none", background: "transparent", cursor: "pointer",
    fontSize: 12, fontWeight: 500, textAlign: "left",
    transition: "all var(--transition)", borderLeft: "2px solid transparent",
  },
  tabContent: {
    flex: 1, padding: "16px 20px", overflowY: "auto",
  },
  footer: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 20px", borderTop: "1px solid var(--border)", flexShrink: 0,
  },
  input: {
    width: "100%", padding: "7px 10px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "var(--bg3)",
    color: "var(--text)", fontSize: 12, outline: "none",
    transition: "border-color var(--transition), box-shadow var(--transition)",
  },
  select: {
    padding: "6px 10px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "var(--bg3)",
    color: "var(--text)", fontSize: 12, outline: "none", flex: 1,
    transition: "border-color var(--transition)",
  },
  textarea: {
    width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "var(--bg3)",
    color: "var(--text)", fontSize: 12, outline: "none",
    resize: "vertical", fontFamily: "monospace", lineHeight: 1.6,
    transition: "border-color var(--transition), box-shadow var(--transition)",
  },
  providerCard: {
    borderRadius: "var(--radius-sm)", border: "1px solid var(--border2)",
    background: "var(--bg3)", overflow: "hidden",
    transition: "border-color var(--transition)",
  },
  providerHeader: {
    display: "flex", alignItems: "center", padding: "8px 12px",
    cursor: "pointer", userSelect: "none",
  },
  providerBody: {
    padding: "8px 12px 12px", borderTop: "1px solid var(--border)",
  },
  skillCard: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: "var(--radius-sm)",
    background: "var(--bg3)", border: "1px solid var(--border2)",
    transition: "all var(--transition)",
  },
  toggle: { flexShrink: 0, cursor: "pointer" },
  agentCard: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: "var(--radius-sm)",
    background: "var(--bg3)", border: "1px solid var(--border2)",
    transition: "all var(--transition)",
  },
  agentAvatar: {
    width: 30, height: 30, borderRadius: "var(--radius-sm)",
    background: "var(--accent-soft)", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  editBtn: {
    display: "flex", alignItems: "center", gap: 4,
    padding: "3px 8px", borderRadius: 4, border: "none",
    background: "var(--accent-soft)", color: "var(--accent)",
    cursor: "pointer", fontSize: 11, fontWeight: 500,
    transition: "all var(--transition)",
  },
  deleteBtn: {
    padding: "3px 8px", borderRadius: 4, border: "none",
    background: "transparent", color: "var(--danger)",
    cursor: "pointer", fontSize: 11, transition: "all var(--transition)",
  },
  addBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "9px", borderRadius: "var(--radius-sm)",
    border: "1px dashed var(--border2)", background: "transparent",
    color: "var(--text2)", cursor: "pointer", fontSize: 12,
    marginTop: 8, transition: "all var(--transition)", fontWeight: 500,
  },
  dangerBtn: {
    padding: "4px 12px", borderRadius: 4, border: "none",
    background: "rgba(248,113,113,0.1)", color: "var(--danger)",
    cursor: "pointer", fontSize: 11, transition: "all var(--transition)",
  },
  saveBtn: {
    padding: "7px 20px", borderRadius: "var(--radius-sm)",
    border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 12,
    transition: "all var(--transition)", boxShadow: "var(--shadow-accent)",
  },
  cancelBtn: {
    padding: "7px 18px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border2)", background: "transparent",
    color: "var(--text2)", cursor: "pointer", fontSize: 12,
    transition: "all var(--transition)",
  },
  helpGrid: {
    display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "center",
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
};

// hover 补丁
const settingsStyleTag = document.createElement("style");
settingsStyleTag.textContent = `
  .settings-tab:hover { background: var(--bg4) !important; }
  .settings-provider:hover { border-color: var(--accent) !important; }
  .settings-agent:hover { border-color: var(--border) !important; background: var(--bg4) !important; }
  .settings-add:hover { border-color: var(--accent) !important; color: var(--accent) !important; background: var(--accent-soft) !important; }
  .settings-danger:hover { background: rgba(248,113,113,0.2) !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
if (typeof document !== "undefined" && !document.getElementById("settings-styles")) {
  settingsStyleTag.id = "settings-styles";
  document.head.appendChild(settingsStyleTag);
}
