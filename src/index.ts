import "dotenv/config";

/**
 * agentFamily CLI — 带会话持久化的交互式 Agent
 *
 * 启动自动恢复最近会话。命令：
 *   /debug     切换调试模式
 *   /sessions  列出历史会话并切换
 *   /new       开始新会话
 *   /quit      退出
 */

import { createAgent, type AccessMode } from "./agent/createAgent.js";
import { defaultAgent } from "./agent/config.js";
import { customTools } from "./tools/index.js";
import {
  saveSession,
  loadSession,
  listSessions,
  generateSessionId,
  formatTime,
} from "./session/store.js";
import {
  loadExtensions,
  collectTools,
  collectCommands,
  type ExtensionCommand,
} from "./extensions/loader.js";
import { createInterface } from "node:readline/promises";

let debugMode = false;
let accessMode: AccessMode = "ask";
let currentSessionId: string;
let firstUserInput = "";
let agent: ReturnType<typeof createAgent>;
let rl: ReturnType<typeof createInterface>;
let extCommands: ExtensionCommand[] = [];

// ─── 调试事件打印 ──────────────────────────────

function printDebugEvent(event: any) {
  const t = event.type;

  if (t === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
    return;
  }

  if (t === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") {
    process.stdout.write("\x1b[2m" + event.assistantMessageEvent.delta + "\x1b[0m");
    return;
  }

  if (t === "message_update") {
    const m = event.assistantMessageEvent;
    if (m.type === "toolcall_start") {
      const tc = m.partial?.content?.[m.contentIndex];
      console.log("\n\x1b[33m[toolcall_start]\x1b[0m name=" + tc?.name + "  input=" + JSON.stringify(tc?.input));
    } else {
      console.log("  \x1b[2m[message_update]\x1b[0m " + m.type);
    }
    return;
  }

  const json = JSON.stringify(event);
  const display = json.length > 600 ? json.slice(0, 600) + "\u2026" : json;
  const color = t.includes("start") ? "\x1b[32m" : t.includes("end") ? "\x1b[36m" : "\x1b[2m";
  console.log(color + "[" + t + "]\x1b[0m " + display);
}

// ─── 事件订阅 ──────────────────────────────────

function subscribeAgent(a: ReturnType<typeof createAgent>) {
  a.subscribe((event: any) => {
    if (debugMode) {
      printDebugEvent(event);
      return;
    }

    switch (event.type) {
      case "message_update": {
        const msg = event.assistantMessageEvent;
        switch (msg.type) {
          case "text_delta":
            process.stdout.write(msg.delta);
            break;
          case "toolcall_start": {
            const tc = msg.partial?.content?.[msg.contentIndex];
            console.log("\n  \uD83D\uDD27 " + (tc?.name ?? "?") + "(" + JSON.stringify(tc?.input ?? {}).slice(0, 60) + ")");
            break;
          }
        }
        break;
      }
      case "tool_execution_end":
        console.log("  \u2705 完成");
        break;
      case "agent_end":
        process.stdout.write("\n");
        saveSession(
          currentSessionId,
          agent.state.messages,
          firstUserInput || undefined
        ).catch((err) => console.error("保存失败:", err.message));
        break;
    }
  });
}

// ─── Agent 创建 ────────────────────────────────

/** 直接从 stdin 读一个字符，不依赖 readline。用完后恢复原状。 */
function askChar(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const wasRaw = process.stdin.isRaw;
    if (typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(true);
    }
    const onData = (buf: Buffer) => {
      process.stdin.removeListener("data", onData);
      if (typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(wasRaw ?? false);
      }
      const char = buf.toString("utf-8").trim().toLowerCase();
      process.stdout.write(char + "\n");
      resolve(char);
    };
    process.stdin.on("data", onData);
  });
}

async function newAgent(sessionId?: string, initialMessages?: any[]) {
  // 加载扩展
  const extensions = await loadExtensions();
  const extTools = collectTools(extensions);
  extCommands = collectCommands(extensions);

  // 合并内置工具 + 扩展工具
  const allTools = [...customTools, ...extTools];

  agent = createAgent(defaultAgent, allTools as any, initialMessages ?? [], {
    accessMode,
    onAsk: async (toolName, params) => {
      const safe = params && typeof params === "object" ? params : {};
      console.log("\n  ⚠ 权限请求: " + toolName);
      console.log("     参数: " + JSON.stringify(safe).slice(0, 100));
      const answer = await askChar("     允许? [y/N] ");
      return answer === "y";
    },
  });
  subscribeAgent(agent);
  if (sessionId) currentSessionId = sessionId;
}

// ─── 命令处理 ──────────────────────────────────

async function handleSessions(rl: ReturnType<typeof createInterface>) {
  const sessions = await listSessions();
  console.log("");
  if (sessions.length === 0) {
    console.log("暂无历史会话");
    return;
  }
  sessions.forEach((s, i) => {
    const marker = s.id === currentSessionId ? " *当前*" : "";
    console.log("  [" + (i + 1) + "] " + s.title.slice(0, 35) + "  |  " + formatTime(s.updatedAt) + marker);
  });
  console.log("  输入编号切换，或按 Enter 取消");

  const choice = await rl.question("切换 > ");
  const idx = parseInt(choice) - 1;
  if (!isNaN(idx) && sessions[idx]) {
    const s = sessions[idx];
    const loaded = await loadSession(s.id);
    if (loaded) {
      await newAgent(s.id, loaded.messages);
      console.log("已切换到: " + s.title + " (" + loaded.messages.length + " 条消息)");
    }
  }
}

// ─── 主函数 ────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║       🤖 agentFamily v0.2        ║");
  console.log("║   基于 Pi SDK 的 Agent 开发项目    ║");
  console.log("╚══════════════════════════════════╝");

  // 自动恢复最近会话
  const sessions = await listSessions();
  if (sessions.length > 0) {
    const latest = sessions[0];
    const loaded = await loadSession(latest.id);
    if (loaded) {
      await newAgent(latest.id, loaded.messages);
      console.log("\n📖 已恢复: " + latest.title + " (" + loaded.messages.length + " 条消息)");
    } else {
      await newAgent(generateSessionId());
    }
  } else {
    await newAgent(generateSessionId());
  }

  console.log("");
  console.log("当前 Agent : " + defaultAgent.name);
  console.log("模型      : " + defaultAgent.modelId);
  console.log("访问模式  : " + accessMode);
  console.log("内置工具  : " + customTools.map((t) => t.name).join(", "));
  if (extCommands.length > 0) {
    console.log("扩展命令  : " + extCommands.map((c) => "/" + c.name).join(", "));
  }
  console.log("");
  console.log("  /debug     切换调试模式");
  console.log("  /mode      切换访问模式 (readonly / ask / auto)");
  console.log("  /sessions  查看/切换历史会话");
  console.log("  /new       开始新会话");
  console.log("  /quit      退出");
  console.log("──────────────────────────────────");

  rl = createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const input = await rl.question("\n> ");
    if (!input.trim()) continue;
    if (input === "/quit" || input === "/q") break;

    if (input === "/debug") {
      debugMode = !debugMode;
      console.log("\n🔍 Debug: " + (debugMode ? "ON" : "OFF"));
      continue;
    }

    // 扩展斜杠命令（如 /weather）
    if (input.startsWith("/") && !["/debug", "/mode", "/sessions", "/new", "/quit", "/q"].includes(input.split(" ")[0])) {
      const [cmdName, ...rest] = input.slice(1).split(" ");
      const cmd = extCommands.find((c) => c.name === cmdName);
      if (cmd) {
        const result = await cmd.handler(rest.join(" "));
        console.log("\n" + result);
        continue;
      }
    }

    if (input === "/mode") {
      const modes: AccessMode[] = ["readonly", "ask", "auto"];
      const idx = modes.indexOf(accessMode);
      accessMode = modes[(idx + 1) % modes.length];
      await newAgent(currentSessionId, agent.state.messages);
      console.log("\n🔒 访问模式: " + accessMode);
      console.log("  readonly = 只读    |  ask = 写前询问    |  auto = 自动放行");
      continue;
    }

    if (input === "/sessions") {
      await handleSessions(rl);
      continue;
    }

    if (input === "/new") {
      currentSessionId = generateSessionId();
      firstUserInput = "";
      await newAgent(currentSessionId);
      console.log("\n📝 新会话: " + currentSessionId);
      continue;
    }

    console.log("");
    if (!firstUserInput) {
      firstUserInput = input;
    }
    try {
      await agent.prompt(input);
    } catch (err) {
      console.error("Agent 错误:", err instanceof Error ? err.message : err);
    }
  }

  rl.close();
  console.log("\n再见 👋");
}

main().catch(console.error);
