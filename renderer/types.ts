/** 前端展示用消息类型 */

export interface DisplayToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "pending" | "running" | "success" | "error";
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: DisplayToolCall[];
  timestamp: number;
  isStreaming: boolean;
}

/** 会话元数据（与服务端 SessionMeta 一致） */
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  modelId?: string;
  accessMode?: string;
}
