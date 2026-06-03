/**
 * 多 Agent 编排系统 — 统一导出
 */

export type {
  TaskType,
  Task,
  TaskPlan,
  Contract,
  Dependency,
  AgentStyle,
  SubAgentContext,
  TaskResult,
  FileDiff,
  ReviewResult,
  ReviewIssue,
  OrchestratorState,
  OrchestratorEvent,
  ProjectRules,
} from "./types.js";

export { runOrchestrator, type AgentFactory, type FileService, type OrchestratorDeps } from "./orchestrator.js";
export { buildDecomposePrompt, parseDecomposeResult } from "./decomposer.js";
export { buildSubAgentContext, buildSubAgentPrompt, buildSubAgentTaskPrompt, parseTaskResult, getDefaultStyle } from "./executor.js";
export { buildReviewPrompt, parseReviewResult } from "./reviewer.js";
