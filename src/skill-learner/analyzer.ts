/**
 * 会话分析器
 *
 * 从历史会话中提取工作流模式：
 * - 工具调用序列
 * - 文件访问模式
 * - 重复的操作流程
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SessionSummary, WorkflowPattern } from "./types.js";

const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");

/**
 * 加载最近 N 天的会话
 */
export async function loadRecentSessions(days: number = 7): Promise<SessionSummary[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const summaries: SessionSummary[] = [];

  try {
    const files = await fs.readdir(SESSIONS_DIR);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
        const session = JSON.parse(raw);

        // 跳过过期会话
        if ((session.meta?.updatedAt || 0) < cutoff) continue;
        // 跳过空会话
        if (!session.messages || session.messages.length === 0) continue;

        const summary = extractSummary(session);
        summaries.push(summary);
      } catch {
        // 损坏的文件跳过
      }
    }
  } catch {
    // 目录不存在
  }

  return summaries;
}

/**
 * 从单个会话中提取摘要
 */
function extractSummary(session: any): SessionSummary {
  const toolCalls: string[] = [];
  const filesAccessed: string[] = [];

  for (const msg of session.messages) {
    // 提取工具调用
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.function?.name) {
          toolCalls.push(tc.function.name);
        }
      }
    }

    // 提取文件访问（从工具参数中）
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && block.input) {
          const input = block.input;
          if (input.path) filesAccessed.push(input.path);
          if (input.file_path) filesAccessed.push(input.file_path);
          if (input.command) {
            // 从 bash 命令中提取文件引用
            const fileMatches = input.command.match(/[\w/.-]+\.\w+/g);
            if (fileMatches) filesAccessed.push(...fileMatches);
          }
        }
      }
    }

    // 提取文件引用（从文本消息中）
    if (msg.role === "user" && typeof msg.content === "string") {
      const fileMatches = msg.content.match(/[\w/.-]+\.\w+/g);
      if (fileMatches) filesAccessed.push(...fileMatches);
    }
  }

  return {
    id: session.meta?.id || "unknown",
    title: session.meta?.title || "未命名",
    messageCount: session.messages.length,
    toolCalls,
    filesAccessed: [...new Set(filesAccessed)], // 去重
    createdAt: session.meta?.createdAt || 0,
    updatedAt: session.meta?.updatedAt || 0,
  };
}

/**
 * 从会话摘要中识别工具调用模式
 */
export function extractToolPatterns(summaries: SessionSummary[]): Map<string, number> {
  const patterns = new Map<string, number>();

  for (const summary of summaries) {
    // 提取连续的工具调用序列（长度 2-5）
    for (let len = 2; len <= Math.min(5, summary.toolCalls.length); len++) {
      for (let i = 0; i <= summary.toolCalls.length - len; i++) {
        const seq = summary.toolCalls.slice(i, i + len).join(" → ");
        patterns.set(seq, (patterns.get(seq) || 0) + 1);
      }
    }
  }

  return patterns;
}

/**
 * 从会话摘要中识别文件访问模式
 */
export function extractFilePatterns(summaries: SessionSummary[]): Map<string, number> {
  const patterns = new Map<string, number>();

  for (const summary of summaries) {
    // 按文件类型分组
    const extGroups = new Map<string, string[]>();
    for (const file of summary.filesAccessed) {
      const ext = path.extname(file) || "no-ext";
      if (!extGroups.has(ext)) extGroups.set(ext, []);
      extGroups.get(ext)!.push(file);
    }

    // 记录文件类型组合
    const extCombo = [...extGroups.keys()].sort().join("+");
    if (extCombo) {
      patterns.set(extCombo, (patterns.get(extCombo) || 0) + 1);
    }
  }

  return patterns;
}

/**
 * 识别高频模式（出现次数 >= 阈值）
 */
export function identifyHighFrequencyPatterns(
  patterns: Map<string, number>,
  threshold: number = 3
): Array<{ pattern: string; count: number }> {
  return [...patterns.entries()]
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([pattern, count]) => ({ pattern, count }));
}

/**
 * 生成会话分析报告（纯规则匹配，不调用 LLM）
 */
export function generateAnalysisReport(summaries: SessionSummary[]): {
  toolPatterns: Array<{ pattern: string; count: number }>;
  filePatterns: Array<{ pattern: string; count: number }>;
  summary: {
    totalSessions: number;
    avgMessages: number;
    topTools: Array<{ tool: string; count: number }>;
    topFiles: Array<{ file: string; count: number }>;
  };
} {
  const toolPatterns = identifyHighFrequencyPatterns(extractToolPatterns(summaries));
  const filePatterns = identifyHighFrequencyPatterns(extractFilePatterns(summaries));

  // 统计工具使用频率
  const toolCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  let totalMessages = 0;

  for (const s of summaries) {
    totalMessages += s.messageCount;
    for (const t of s.toolCalls) {
      toolCounts.set(t, (toolCounts.get(t) || 0) + 1);
    }
    for (const f of s.filesAccessed) {
      fileCounts.set(f, (fileCounts.get(f) || 0) + 1);
    }
  }

  const topTools = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }));

  const topFiles = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  return {
    toolPatterns,
    filePatterns,
    summary: {
      totalSessions: summaries.length,
      avgMessages: summaries.length > 0 ? Math.round(totalMessages / summaries.length) : 0,
      topTools,
      topFiles,
    },
  };
}
