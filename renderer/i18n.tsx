/**
 * 简易 i18n 系统
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export const langs = ["zh", "en"] as const;
export type Lang = typeof langs[number];

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    appName: "agentFamily",
    send: "发送",
    inputPlaceholder: "输入消息...",
    newSession: "新建",
    sessions: "会话",
    archived: "已归档",
    noSessions: "暂无会话",
    untitled: "未命名",
    readonly: "只读",
    ask: "询问",
    auto: "自动",
    thinkOff: "思考: 关",
    thinkMin: "思考: 极简",
    thinkLow: "思考: 低",
    thinkMed: "思考: 中",
    thinkHigh: "思考: 高",
    settings: "设置",
    systemPrompt: "System Prompt（人格设定）",
    save: "保存",
    cancel: "取消",
    desk: "书桌",
    back: "返回上级",
    emptyDir: "空目录",
    permission: "权限确认",
    allow: "允许",
    deny: "拒绝",
    agentManage: "Agent 管理",
    newAgent: "+ 新建 Agent",
    agentName: "名称",
    agentId: "ID",
    agentModel: "默认模型",
    agentPrompt: "System Prompt",
    edit: "编辑",
    delete: "删除",
    rename: "重命名",
    archive: "归档",
    thinkProcess: "思考过程",
    helpTitle: "可用命令",
    helpSettings: "System Prompt / 模型 / 模式",
    helpSidebar: "历史会话切换 / 新建",
    helpEnter: "Enter 发送 / Shift+Enter 换行",
    contextTokens: "/ 128k",
  },
  en: {
    appName: "agentFamily",
    send: "Send",
    inputPlaceholder: "Type a message...",
    newSession: "+ New",
    sessions: "Sessions",
    archived: "ARCHIVED",
    noSessions: "No sessions",
    untitled: "Untitled",
    readonly: "Readonly",
    ask: "Ask",
    auto: "Auto",
    thinkOff: "Think: Off",
    thinkMin: "Think: Min",
    thinkLow: "Think: Low",
    thinkMed: "Think: Med",
    thinkHigh: "Think: High",
    settings: "Settings",
    systemPrompt: "System Prompt",
    save: "Save",
    cancel: "Cancel",
    desk: "Desk",
    back: "Back",
    emptyDir: "Empty",
    permission: "Permission",
    allow: "Allow",
    deny: "Deny",
    agentManage: "Agent Manager",
    newAgent: "+ New Agent",
    agentName: "Name",
    agentId: "ID",
    agentModel: "Default Model",
    agentPrompt: "System Prompt",
    edit: "Edit",
    delete: "Delete",
    rename: "Rename",
    archive: "Archive",
    thinkProcess: "Thinking",
    helpTitle: "Commands",
    helpSettings: "System Prompt / Model / Mode",
    helpSidebar: "Session history / New",
    helpEnter: "Enter send / Shift+Enter new line",
    contextTokens: "/ 128k",
  },
};

const LANG_KEY = "agentfamily_lang";

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && langs.includes(stored as Lang)) return stored as Lang;
  } catch { }
  const nav = navigator.language || "";
  return nav.startsWith("zh") ? "zh" : "en";
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string }>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectLang);

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch { }
  }, [lang]);

  const t = (key: string) => translations[lang][key] || translations.en[key] || key;

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useT() {
  return useContext(LangCtx).t;
}

export function useLang() {
  const ctx = useContext(LangCtx);
  return { lang: ctx.lang, setLang: ctx.setLang };
}
