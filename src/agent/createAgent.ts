/**
 * Agent 工厂
 *
 * 基于 Pi SDK 创建 Agent 实例，支持：
 *   - 访问模式（只读/询问/自动）
 *   - 工具执行前后钩子
 *   - 上下文注入
 *   - 沙盒权限检查
 */

import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import * as path from "node:path";
import type { AgentConfig } from "../types/index.js";
import { checkBashWritePermission, checkWritePermission } from "../sandbox.js";
import { getSandbox } from "../tools/index.js";

// ─── 类型 ──────────────────────────────────────

export type AccessMode = "readonly" | "ask" | "auto";

export interface AgentHooks {
  /**
   * 访问模式
   *   readonly: 禁止所有写操作
   *   ask:      写操作前回调 onAsk 询问用户
   *   auto:     全部自动放行
   */
  accessMode?: AccessMode;

  /**
   * 当 accessMode=ask 且遇到写操作时调用。
   * 返回 true 放行，false 阻止。
   */
  onAsk?: (toolName: string, params: Record<string, unknown>) => Promise<boolean>;
}

/** 写操作工具名单 */
const WRITE_TOOLS = new Set(["write_file", "bash", "edit"]);

// ─── 工厂 ──────────────────────────────────────

export function createAgent(
  config: AgentConfig,
  tools?: Agent["state"]["tools"],
  initialMessages?: any[],
  hooks?: AgentHooks
) {
  const model = getModel(config.modelProvider as any, config.modelId as any);
  console.log(`[createAgent] 请求模型: ${config.modelProvider}/${config.modelId} → 实际解析: ${model?.provider}/${model?.id}`);
  const accessMode = hooks?.accessMode ?? "ask";

  const agent = new Agent({
    initialState: {
      systemPrompt: config.systemPrompt,
      model,
      tools: tools ?? [],
      messages: initialMessages ?? [],
      thinkingLevel: (config as any).thinking || "off",
    },

    // ═══════════════════════════════════════════
    // 钩子 1: beforeToolCall — 权限门禁 + 沙盒检查
    // ═══════════════════════════════════════════
    beforeToolCall: async ({ toolCall }) => {
      const isWrite = WRITE_TOOLS.has(toolCall.name);
      const params = (toolCall as any).input as Record<string, unknown>;

      // 1. 只读模式检查
      if (accessMode === "readonly" && isWrite) {
        return {
          block: true,
          reason: `[只读模式] 已阻止写操作: ${toolCall.name}`,
        };
      }

      // 2. 沙盒权限检查
      const sandbox = getSandbox();
      if (sandbox.enabled) {
        // bash 工具：检查命令中的写目标
        if (toolCall.name === "bash" && typeof params.command === "string") {
          const sandboxError = checkBashWritePermission(params.command, sandbox);
          if (sandboxError) {
            return { block: true, reason: sandboxError };
          }
        }
        // write_file/edit 工具：检查目标路径
        if ((toolCall.name === "write_file" || toolCall.name === "edit") && typeof params.filePath === "string") {
          const fullPath = path.resolve(process.cwd(), params.filePath);
          const sandboxError = checkWritePermission(fullPath, sandbox);
          if (sandboxError) {
            return { block: true, reason: sandboxError };
          }
        }
      }

      // 3. 询问模式检查
      if (accessMode === "ask" && isWrite && hooks?.onAsk) {
        const allowed = await hooks.onAsk(toolCall.name, params);
        if (!allowed) {
          return { block: true, reason: "用户取消了此操作" };
        }
      }

      // auto 模式或读工具：放行
    },

    // ═══════════════════════════════════════════
    // 钩子 2: afterToolCall — 结果后处理 + 自动终止
    // ═══════════════════════════════════════════
    afterToolCall: async ({ toolCall, isError }) => {
      if (isError) {
        console.log("  ⚠ " + toolCall.name + " 执行出错");
      }
      return undefined;
    },

    // ═══════════════════════════════════════════
    // 钩子 3: transformContext — 上下文注入
    // ═══════════════════════════════════════════
    transformContext: async (messages) => {
      const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
      const modelName = config.modelId || "unknown";
      const injected = [...messages];

      // 规范化 assistant 消息的 content 格式，防止 SDK 内部 flatMap 报错
      for (const msg of injected) {
        if ((msg as any).role === "assistant" && typeof (msg as any).content === "string") {
          (msg as any).content = (msg as any).content ? [{ type: "text", text: (msg as any).content }] : [];
        }
      }
      if (injected.length > 0 && (injected[0] as any).role === "system") {
        const sysMsg = injected[0] as any;
        if (typeof sysMsg.content === "string") {
          sysMsg.content =
            sysMsg.content +
            `\n\n[重要系统信息] 你当前运行的模型是: ${modelName}。如果有人问"你是什么模型"，必须回答这个具体的模型名。当前时间: ${now}`;
          console.log(`[transformContext] 已注入模型: ${modelName}, system prompt 长度: ${sysMsg.content.length}`);
        } else {
          console.log(`[transformContext] sysMsg.content 不是 string, 类型: ${typeof sysMsg.content}`);
        }
      } else {
        console.log(`[transformContext] 消息数: ${injected.length}, 第一条角色: ${injected[0]?.role}`);
      }
      return injected;
    },

    // 工具执行模式: 目前工具少，串行更可控
    toolExecution: "sequential",
  });

  return agent;
}
