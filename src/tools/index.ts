/**
 * 自定义工具
 *
 * 每个工具必须有 execute 方法，Agent 内部会自动调用它。
 * description 决定了 Agent 在什么场景下选择这个工具。
 */

import { Type } from "typebox";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as https from "node:https";

/** 工作根目录，文件工具只能访问此目录下的内容 */
const WORK_ROOT = path.resolve(process.cwd());

/** 安全检查：确保目标路径在工作目录内 */
function safePath(targetPath: string): string {
  const resolved = path.resolve(WORK_ROOT, targetPath);
  if (!resolved.startsWith(WORK_ROOT)) {
    throw new Error(`禁止访问工作目录外的路径: ${targetPath}`);
  }
  return resolved;
}

// ═══════════════════════════════════════════════
// 文件系统工具
// ═══════════════════════════════════════════════

/** 读取文件 */
export const readFile = {
  name: "read_file",
  description:
    "读取指定文件的内容。当需要查看文件、理解代码、阅读文档时使用。支持文本文件。",
  parameters: Type.Object({
    filePath: Type.String({
      description: "相对于工作目录的文件路径，如 'src/index.ts' 或 'package.json'",
    }),
  }),
  async execute(
    _id: string,
    params: { filePath: string },
    _signal: AbortSignal
  ) {
    try {
      const fullPath = safePath(params.filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n").length;
      return {
        content: [
          {
            type: "text" as const,
            text: `=== ${params.filePath} (${lines} 行) ===\n${content}`,
          },
        ],
        details: {},
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `读取失败: ${err.message}` }],
        details: { isError: true },
      };
    }
  },
};

/** 写入文件 */
export const writeFile = {
  name: "write_file",
  description:
    "创建或覆盖写入文件。当需要保存内容、创建新文件、生成代码时使用。注意：这会覆盖已有文件。",
  parameters: Type.Object({
    filePath: Type.String({
      description: "相对于工作目录的文件路径，如 'output/result.txt'",
    }),
    content: Type.String({
      description: "要写入的文件内容",
    }),
  }),
  async execute(
    _id: string,
    params: { filePath: string; content: string },
    _signal: AbortSignal
  ) {
    try {
      const fullPath = safePath(params.filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, params.content, "utf-8");
      const size = Buffer.byteLength(params.content, "utf-8");
      return {
        content: [
          {
            type: "text" as const,
            text: `已写入 ${params.filePath} (${size} 字节)`,
          },
        ],
        details: {},
      };
    } catch (err: any) {
      console.error("  [write_file 调试] 错误:", err.message, "code:", err.code, "path:", params?.filePath);
      return {
        content: [{ type: "text" as const, text: `写入失败: ${err.message}` }],
        details: {},
      };
    }
  },
};

/** 列出目录 */
export const listDirectory = {
  name: "list_directory",
  description:
    "列出目录下的文件和子目录。当需要了解项目结构、查找文件、浏览目录时使用。",
  parameters: Type.Object({
    dirPath: Type.Optional(
      Type.String({
        description: "相对于工作目录的路径，不填则列出根目录",
      })
    ),
  }),
  async execute(
    _id: string,
    params: { dirPath?: string },
    _signal: AbortSignal
  ) {
    try {
      const target = params.dirPath || ".";
      const fullPath = safePath(target);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const lines = entries.map((e) => {
        const suffix = e.isDirectory() ? "/" : "";
        return `  ${e.name}${suffix}`;
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `${target}/ (${entries.length} 项):\n${lines.join("\n")}`,
          },
        ],
        details: {},
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `列目录失败: ${err.message}` }],
        details: { isError: true },
      };
    }
  },
};

// ═══════════════════════════════════════════════
// 通用工具
// ═══════════════════════════════════════════════

/**
 * 联网搜索
 */
export const webSearch = {
  name: "web_search",
  description:
    "联网搜索互联网信息。当需要查找最新资讯、技术文档、事实数据时使用。返回搜索结果的标题、摘要和链接。",
  parameters: Type.Object({
    query: Type.String({
      description: "搜索关键词，用空格分隔，如 'TypeScript 5.6 新特性'",
    }),
  }),
  async execute(
    _id: string,
    params: { query: string },
    _signal: AbortSignal
  ) {
    try {
      const results = await duckDuckGoSearch(params.query);
      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `未找到与 "${params.query}" 相关的结果。` }],
          details: {},
        };
      }
      const text = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`
        )
        .join("\n\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `搜索 "${params.query}" 的结果 (${results.length} 条):\n\n${text}`,
          },
        ],
        details: {},
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `搜索失败: ${err.message}` }],
        details: {},
      };
    }
  },
};

/** DuckDuckGo HTML 搜索（无需 API Key） */
async function duckDuckGoSearch(
  query: string
): Promise<{ title: string; snippet: string; url: string }[]> {
  // DDG Lite（纯 HTML，全球可用性更好）
  try {
    const encoded = encodeURIComponent(query);
    const html = await fetchHtml(
      `https://lite.duckduckgo.com/lite/?q=${encoded}`,
      10000
    );
    const results = parseDDGLite(html);
    if (results.length > 0) return results;
  } catch { /* fall through */ }

  // 备用 Bing
  try {
    const encoded = encodeURIComponent(query);
    const html = await fetchHtml(
      `https://www.bing.com/search?q=${encoded}&setlang=zh-cn`,
      10000
    );
    const results = parseBing(html);
    if (results.length > 0) return results;
  } catch { /* fall through */ }

  return [];
}

/** DDG Lite 解析 */
function parseDDGLite(html: string) {
  const results: { title: string; snippet: string; url: string }[] = [];
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const snippetRegex = /<td class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  let m;
  while ((m = linkRegex.exec(html)) !== null && links.length < 10) {
    const url = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").trim();
    if (title && url.startsWith("http")) links.push({ url, title });
  }

  const snippets: string[] = [];
  while ((m = snippetRegex.exec(html)) !== null && snippets.length < 10) {
    snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
  }

  const count = Math.min(links.length, snippets.length, 8);
  for (let i = 0; i < count; i++) {
    results.push({ ...links[i], snippet: snippets[i] });
  }

  return results;
}

/** Bing 搜索结果解析 */
function parseBing(html: string) {
  const results: { title: string; snippet: string; url: string }[] = [];
  const blocks = html.split('<li class="b_algo"');
  for (let i = 1; i < blocks.length && results.length < 8; i++) {
    const block = blocks[i];
    const urlMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    const snippetMatch = block.match(/<p[^>]*>([^<]+)<\/p>/);
    if (urlMatch && snippetMatch) {
      results.push({
        title: urlMatch[2].replace(/<[^>]+>/g, "").trim(),
        snippet: snippetMatch[1].replace(/<[^>]+>/g, "").trim(),
        url: urlMatch[1],
      });
    }
  }
  return results;
}

function fetchHtml(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: timeoutMs,
      },
      (res) => {
        // 处理重定向
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location, timeoutMs).then(resolve).catch(reject);
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    req.on("error", reject);
  });
}

// ═══════════════════════════════════════════════
// 通用工具
// ═══════════════════════════════════════════════

/**
 * 获取当前时间
 */
export const getCurrentTime = {
  name: "get_current_time",
  description:
    "获取当前日期和时间。当用户询问「现在几点」「今天几号」时使用。返回格式化时间字符串。",
  parameters: Type.Object({
    timezone: Type.Optional(
      Type.String({
        description: "时区，如 Asia/Shanghai。不填默认 Asia/Shanghai。",
      })
    ),
  }),
  async execute(
    _toolCallId: string,
    params: { timezone?: string },
    _signal: AbortSignal
  ) {
    const tz = params.timezone || "Asia/Shanghai";
    const now = new Date().toLocaleString("zh-CN", { timeZone: tz });
    return {
      content: [{ type: "text" as const, text: `${now} (${tz})` }],
      details: {},
    };
  },
};

/**
 * 计算器
 */
export const calculator = {
  name: "calculator",
  description:
    "执行数学计算。支持加减乘除和括号。当用户要求计算数值时使用。",
  parameters: Type.Object({
    expression: Type.String({
      description: "数学表达式，如 '(10 * 1.15) + 50'",
    }),
  }),
  async execute(
    _toolCallId: string,
    params: { expression: string },
    _signal: AbortSignal
  ) {
    try {
      const result = Function(`"use strict"; return (${params.expression})`)();
      return {
        content: [
          {
            type: "text" as const,
            text: `${params.expression} = ${result}`,
          },
        ],
        details: {},
      };
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `计算错误：无法解析表达式 "${params.expression}"`,
          },
        ],
        details: { isError: true },
      };
    }
  },
};

/** 所有自定义工具 */
export const customTools = [
  readFile,
  writeFile,
  listDirectory,
  webSearch,
  getCurrentTime,
  calculator,
];
