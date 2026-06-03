/**
 * 服务端设置存储
 *
 * 持久化到项目根目录 settings.json，支持：
 *   - System Prompt 编辑
 *   - 模型切换
 *   - 访问模式
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const SETTINGS_PATH = path.resolve(process.cwd(), "settings.json");

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  source: string;          // github url 或 "local"
  enabled: boolean;
  installedAt: number;
}

export interface AppSettings {
  systemPrompt: string;
  agents?: AgentProfile[];
  theme?: string;
  lang?: string;
  modelProviders?: ModelProvider[];
  activeProvider?: string;
  activeModel?: string;
  skills?: SkillMeta[];
  agentSkills?: Record<string, string[]>;  // agentId → skillId[]
}

export interface AgentProfile {
  id: string;
  name: string;
  systemPrompt: string;
  defaultModel?: string;
  defaultMode?: string;
}

const defaults: AppSettings = {
  theme: "dark",
  lang: "zh",
  activeProvider: "deepseek",
  activeModel: "deepseek-v4-pro",
  modelProviders: [
    {
      id: "deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v3.2"],
    },
    {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
    },
    {
      id: "google",
      name: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "",
      models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    },
  ],
  skills: [],
  agentSkills: {},
  systemPrompt: `你是 agentFamily，一个运行在用户本地项目目录中的 AI 助手。你由 DeepSeek 模型驱动。

你有以下能力：
- read_file: 读取项目中的任何文件
- write_file: 创建或覆盖写入文件
- list_directory: 浏览目录结构
- web_search: 联网搜索互联网信息
- get_current_time: 获取当前时间
- calculator: 执行数学计算

行为准则：
- 回答前先想清楚，信息不足直接说不知道，不要编造
- 写文件前先说明你要做什么
- 分析代码前先用 read_file 读取，不要凭空猜测`,
  agents: [
    {
      id: "default",
      name: "默认助手",
      systemPrompt: `你是 agentFamily 默认助手，一个全能的 AI 伙伴。

能力：读写文件、浏览目录、执行计算、查询时间。

风格：简洁高效，直接给答案。`,
    },
    {
      id: "coder",
      name: "代码专家",
      systemPrompt: `你是一个资深的代码审查和编程助手。

核心原则：
- 永远先读代码再给建议，不要猜测
- 解释时从底层原理出发
- 给出可运行的代码示例
- 指出潜在的性能问题和安全风险`,
      defaultModel: "deepseek-v4-pro",
    },
    {
      id: "writer",
      name: "写作助手",
      systemPrompt: `你是一个专业的写作助手。

特长：
- 文章润色和改写
- 文案创作
- 翻译
- 逻辑梳理

风格：清晰、有温度、注重可读性。`,
      defaultModel: "deepseek-v4-flash",
    },
  ],
};

/** 每个会话独立的模式（存在 session 元数据里，不在这里） */

let cached: AppSettings | null = null;

export async function loadSettings(): Promise<AppSettings> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    cached = { ...defaults, ...JSON.parse(raw) };
  } catch {
    cached = { ...defaults };
  }
  return cached;
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  cached = { ...current, ...partial };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(cached, null, 2), "utf-8");
  return cached;
}
