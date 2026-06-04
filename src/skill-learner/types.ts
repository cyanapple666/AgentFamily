/**
 * Skill Auto-Learn 类型定义
 */

/** 从会话中提取的模式 */
export interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  occurrences: number;
  toolSequence: string[];
  filePatterns: string[];
  sampleSessions: string[];
  confidence: number;
}

/** 生成的技能草稿 */
export interface SkillDraft {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  content: string;
  sourcePattern: WorkflowPattern;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

/** 分析报告 */
export interface AnalysisReport {
  analyzedAt: number;
  sessionsAnalyzed: number;
  patternsFound: number;
  skillsGenerated: number;
  skillsUpdated: number;
  patterns: WorkflowPattern[];
  drafts: SkillDraft[];
}

/** 会话摘要（用于分析） */
export interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  toolCalls: string[];
  filesAccessed: string[];
  createdAt: number;
  updatedAt: number;
}
