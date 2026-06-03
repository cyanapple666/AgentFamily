/**
 * Agent 配置
 *
 * 这里定义你的 Agent 家族成员。
 * 后续 Phase 5 做 UI 时，这些配置会从文件/数据库加载。
 */
/** 默认 Agent：你的第一个助手 */
export const defaultAgent = {
    id: "assistant",
    name: "小助手",
    systemPrompt: `你是 agentFamily，一个运行在用户本地项目目录中的 AI 助手。你由 DeepSeek 模型驱动。

你有以下能力：
- read_file: 读取项目中的任何文件
- write_file: 创建或覆盖写入文件
- list_directory: 浏览目录结构
- get_current_time: 获取当前时间
- calculator: 执行数学计算

行为准则：
- 回答前先想清楚，信息不足直接说不知道，不要编造
- 写文件前先说明你要做什么
- 分析代码前先用 read_file 读取，不要凭空猜测`,
    modelProvider: "deepseek",
    modelId: "deepseek-v4-pro",
};
/** 所有已注册的 Agent */
export const agentRegistry = [defaultAgent];
/** 根据 ID 查找 Agent 配置 */
export function getAgentConfig(id) {
    return agentRegistry.find((a) => a.id === id);
}
//# sourceMappingURL=config.js.map