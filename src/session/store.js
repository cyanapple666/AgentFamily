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
// ─── 初始化 ────────────────────────────────────
async function ensureDir() {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
}
// ─── 保存 ──────────────────────────────────────
export async function saveSession(id, messages, userInput, meta) {
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
    try {
        const existing = await fs.readFile(filePath, "utf-8");
        const old = JSON.parse(existing);
        createdAt = old.meta?.createdAt || now;
    }
    catch {
        // 首次保存
    }
    const session = {
        meta: {
            id,
            title,
            createdAt,
            updatedAt: now,
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
export async function loadSession(id) {
    await ensureDir();
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
// ─── 列表 ──────────────────────────────────────
export async function listSessions() {
    await ensureDir();
    try {
        const files = await fs.readdir(SESSIONS_DIR);
        const sessions = [];
        for (const file of files) {
            if (!file.endsWith(".json"))
                continue;
            try {
                const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
                const s = JSON.parse(raw);
                sessions.push(s.meta);
            }
            catch {
                // 损坏的文件跳过
            }
        }
        // 按更新时间倒序
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        return sessions;
    }
    catch {
        return [];
    }
}
// ─── 删除 ──────────────────────────────────────
export async function deleteSession(id) {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
        await fs.unlink(filePath);
    }
    catch {
        // 文件不存在，忽略
    }
}
// ─── 工具函数 ──────────────────────────────────
/** 生成新的会话 ID */
export function generateSessionId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `s_${ts}_${rand}`;
}
/** 格式化时间 */
export function formatTime(ts) {
    return new Date(ts).toLocaleString("zh-CN");
}
//# sourceMappingURL=store.js.map