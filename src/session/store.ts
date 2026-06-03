/**
 * 会话持久化模块
 *
 * 在 Pi SDK 的 Agent 类外包裹一层，实现：
 *   - 保存/加载消息历史到 JSON 文件
 *   - 会话列表
 *   - 自动追加保存
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");

/** 会话元数据 */
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  modelId?: string;
  accessMode?: string;
  thinking?: string;
  agentId?: string;
  archived?: boolean;
}

/** 完整会话（消息体 + 元数据） */
export interface Session {
  meta: SessionMeta;
  messages: any[];
}

// ─── 初始化 ────────────────────────────────────

async function ensureDir() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

// ─── 保存 ──────────────────────────────────────

export async function saveSession(
  id: string,
  messages: any[],
  userInput?: string,
  meta?: { modelId?: string; accessMode?: string; thinking?: string; agentId?: string },
  bumpTime?: boolean
): Promise<void> {
  // 空会话不保存
  if (!messages || messages.length === 0) return;

  await ensureDir();

  // 用第一条用户消息作为标题，截断 40 字
  let title = "未命名会话";
  if (userInput) {
    title = userInput.slice(0, 40).replace(/\n/g, " ");
  }

  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  const now = Date.now();

  // 读取已有文件保留 createdAt
  let createdAt = now;
  let prevUpdatedAt = now;
  try {
    const existing = await fs.readFile(filePath, "utf-8");
    const old = JSON.parse(existing);
    createdAt = old.meta?.createdAt || now;
    prevUpdatedAt = old.meta?.updatedAt || now;
    title = old.meta?.title !== "未命名会话" ? old.meta.title : title;
  } catch {
    // 首次保存
  }

  const session: Session = {
    meta: {
      id,
      title,
      createdAt,
      updatedAt: bumpTime !== false ? now : prevUpdatedAt,
      messageCount: messages.length,
      modelId: meta?.modelId,
      accessMode: meta?.accessMode,
      thinking: meta?.thinking,
      agentId: meta?.agentId,
    },
    messages,
  };

  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
}

// ─── 加载 ──────────────────────────────────────

export async function loadSession(id: string): Promise<Session | null> {
  await ensureDir();
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

// ─── 列表 ──────────────────────────────────────

export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDir();
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions: SessionMeta[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(
          path.join(SESSIONS_DIR, file),
          "utf-8"
        );
        const s = JSON.parse(raw) as Session;
        // 过滤空会话
        if (s.messages && s.messages.length > 0) {
          sessions.push(s.meta);
        }
      } catch {
        // 损坏的文件跳过
      }
    }

    // 按更新时间倒序
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  } catch {
    return [];
  }
}

// ─── 删除 ──────────────────────────────────────

export async function deleteSession(id: string): Promise<void> {
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    await fs.unlink(filePath);
  } catch {
    // 文件不存在，忽略
  }
}

// ─── 工具函数 ──────────────────────────────────

/** 生成新的会话 ID */
export function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `s_${ts}_${rand}`;
}

/** 重命名会话 */
export async function renameSession(id: string, newTitle: string): Promise<void> {
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const session = JSON.parse(raw) as Session;
    session.meta.title = newTitle;
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
  } catch { /* ignore */ }
}

/** 归档/取消归档 */
export async function archiveSession(id: string, archived: boolean): Promise<void> {
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const session = JSON.parse(raw) as Session;
    session.meta.archived = archived;
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
  } catch { /* ignore */ }
}

/** 格式化时间 */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}
