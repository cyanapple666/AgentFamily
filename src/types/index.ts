/**
 * agentFamily 共享类型定义
 */

/** Agent 配置 */
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  modelProvider: "anthropic" | "openai" | "google" | "deepseek";
  modelId: string;
  thinking?: string;
}
