/**
 * Agent 工厂
 *
 * 基于 Pi SDK 创建 Agent 实例，支持：
 *   - 访问模式（只读/询问/自动）
 *   - 工具执行前后钩子
 *   - 上下文注入
 */
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
/** 写操作工具名单 */
const WRITE_TOOLS = new Set(["write_file", "bash", "edit"]);
// ─── 工厂 ──────────────────────────────────────
export function createAgent(config, tools, initialMessages, hooks) {
    const model = getModel(config.modelProvider, config.modelId);
    console.log(`[createAgent] 请求模型: ${config.modelProvider}/${config.modelId} → 实际解析: ${model?.provider}/${model?.id}`);
    const accessMode = hooks?.accessMode ?? "ask";
    const agent = new Agent({
        initialState: {
            systemPrompt: config.systemPrompt,
            model,
            tools: tools ?? [],
            messages: initialMessages ?? [],
            thinkingLevel: config.thinking || "off",
        },
        // ═══════════════════════════════════════════
        // 钩子 1: beforeToolCall — 权限门禁
        // ═══════════════════════════════════════════
        beforeToolCall: async ({ toolCall }) => {
            const isWrite = WRITE_TOOLS.has(toolCall.name);
            if (accessMode === "readonly" && isWrite) {
                return {
                    block: true,
                    reason: `[只读模式] 已阻止写操作: ${toolCall.name}`,
                };
            }
            if (accessMode === "ask" && isWrite && hooks?.onAsk) {
                const allowed = await hooks.onAsk(toolCall.name, toolCall.input);
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
            // 工具执行失败时记录
            if (isError) {
                console.log("  ⚠ " + toolCall.name + " 执行出错，Agent 会自行处理");
            }
            // 可以在这做更多：自动重试、结果缓存、审计日志
        },
        // ═══════════════════════════════════════════
        // 钩子 3: transformContext — 上下文注入
        // ═══════════════════════════════════════════
        transformContext: async (messages) => {
            const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            const modelName = config.modelId || "unknown";
            const injected = [...messages];
            if (injected.length > 0 && injected[0].role === "system") {
                const sysMsg = injected[0];
                if (typeof sysMsg.content === "string") {
                    sysMsg.content =
                        sysMsg.content +
                            `\n\n[重要系统信息] 你当前运行的模型是: ${modelName}。如果有人问"你是什么模型"，必须回答这个具体的模型名。当前时间: ${now}`;
                    console.log(`[transformContext] 已注入模型: ${modelName}, system prompt 长度: ${sysMsg.content.length}`);
                }
                else {
                    console.log(`[transformContext] sysMsg.content 不是 string, 类型: ${typeof sysMsg.content}`);
                }
            }
            else {
                console.log(`[transformContext] 消息数: ${injected.length}, 第一条角色: ${injected[0]?.role}`);
            }
            return injected;
        },
        // 工具执行模式: 目前工具少，串行更可控
        toolExecution: "sequential",
    });
    return agent;
}
//# sourceMappingURL=createAgent.js.map