/**
 * 多 Agent 编排系统 — 核心类型定义
 *
 * 整个系统的数据流：
 *   用户输入 → TaskPlan → Task[] → SubAgent 执行 → TaskResult[] → Review → 最终结果
 */

// ── 任务类型 ──
export type TaskType = "frontend" | "backend" | "ui" | "test" | "docs" | "config";

// ── 数据契约（接口约定） ──
export interface Contract {
  id: string;
  type: "api" | "type" | "schema" | "event";
  name: string;              // 契约名称，如 "getUserAPI"
  definition: string;        // JSON Schema / TypeScript 类型 / 事件格式
  producer: string;          // 产出方 task id
  consumers: string[];       // 消费方 task id[]
}

// ── 任务依赖 ──
export interface Dependency {
  from: string;              // 先完成的 task id
  to: string;                // 后执行的 task id
  reason: string;            // 依赖原因
}

// ── 单个任务 ──
export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string;       // 给 sub-agent 的完整任务描述
  constraints: string[];     // 硬约束（必须遵守）
  files: string[];           // 涉及的现有文件（只读参考）
  output: string[];          // 预期产出的文件路径
  relatedContracts: string[]; // 相关的契约 id
}

// ── 任务计划（主 Agent 产出） ──
export interface TaskPlan {
  summary: string;           // 一句话概括用户需求
  reasoning: string;         // 分解思路（为什么这样拆）
  rules: string[];           // 从项目规章中提取的相关条目
  tasks: Task[];             // 任务列表
  contracts: Contract[];     // 任务间的数据契约
  dependencies: Dependency[];// 依赖关系
}

// ── Sub-Agent 风格 ──
export interface AgentStyle {
  id: string;
  name: string;
  description: string;       // 做事风格、偏好、原则
  expertise: string[];       // 擅长领域
  model?: string;            // 可选：使用不同模型
}

// ── Sub-Agent 执行上下文 ──
export interface SubAgentContext {
  task: Task;
  style: AgentStyle;
  rules: string[];           // 精简后的规章
  contracts: Contract[];     // 相关契约
  projectRoot: string;       // 项目根目录
  fileContents?: Record<string, string>; // 需要参考的文件内容
}

// ── Sub-Agent 执行结果 ──
export interface TaskResult {
  taskId: string;
  status: "success" | "partial" | "failed" | "needs_review";
  diff: FileDiff[];          // 文件变更
  reasoning: string;         // 决策说明
  issues: string[];          // 遇到的问题
  questions: string[];       // 需要主 Agent 回答的问题
  filesRead: string[];       // 实际读取了哪些文件
  filesWritten: string[];    // 实际写入了哪些文件
}

// ── 文件差异 ──
export interface FileDiff {
  path: string;
  action: "create" | "modify" | "delete";
  content?: string;          // 完整新内容（create/modify）
  oldContent?: string;       // 旧内容（modify 时可选，用于对比）
  description: string;       // 这个变更的说明
}

// ── 验收结果 ──
export interface ReviewResult {
  approved: boolean;
  summary: string;
  issues: ReviewIssue[];
  fixes: FileDiff[];         // 主 Agent 自己的修复
}

export interface ReviewIssue {
  severity: "error" | "warning" | "info";
  taskId?: string;
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

// ── 编排器状态 ──
export interface OrchestratorState {
  phase: "idle" | "analyzing" | "decomposing" | "executing" | "reviewing" | "done";
  plan: TaskPlan | null;
  results: TaskResult[];
  review: ReviewResult | null;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
}

// ── 规章制度 ──
export interface ProjectRules {
  id: string;
  category: string;          // "code_style" | "architecture" | "security" | "api" ...
  content: string;
  priority: "must" | "should" | "may";
}

// ── 编排器事件（流式推送） ──
export type OrchestratorEvent =
  | { type: "plan_start" }
  | { type: "plan_delta"; delta: string }         // 分解过程的思考流
  | { type: "plan_ready"; plan: TaskPlan }
  | { type: "task_start"; taskId: string }
  | { type: "task_delta"; taskId: string; delta: string }
  | { type: "task_done"; taskId: string; result: TaskResult }
  | { type: "task_error"; taskId: string; error: string }
  | { type: "review_start" }
  | { type: "review_delta"; delta: string }
  | { type: "review_done"; result: ReviewResult }
  | { type: "final_answer"; content: string };
