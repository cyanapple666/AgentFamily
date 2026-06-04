/**
 * Skill Auto-Learn 入口
 *
 * 编排分析和生成流程：
 * 1. 加载历史会话
 * 2. 提取模式
 * 3. 生成技能草稿
 * 4. 质量检查
 * 5. 保存到 skills 目录
 */

import * as path from "node:path";
import {
  loadRecentSessions,
  generateAnalysisReport,
} from "./analyzer.js";
import type { SessionSummary } from "./types.js";
import {
  generateSkillFromToolPattern,
  generateSkillFromFilePattern,
  findSimilarSkill,
  saveSkillDraft,
} from "./generator.js";
import type { AnalysisReport, SkillDraft, WorkflowPattern } from "./types.js";

/**
 * 运行完整的分析和生成流程
 */
export async function analyzeAndGenerate(days: number = 7): Promise<AnalysisReport> {
  console.log("[SkillLearner] 开始分析最近", days, "天的会话...");

  // Step 1: 加载历史会话
  const sessions = await loadRecentSessions(days);
  console.log(`[SkillLearner] 加载了 ${sessions.length} 个会话`);

  if (sessions.length === 0) {
    return createEmptyReport();
  }

  // Step 2: 生成分析报告
  const report = generateAnalysisReport(sessions);
  console.log(`[SkillLearner] 发现 ${report.toolPatterns.length} 个工具模式, ${report.filePatterns.length} 个文件模式`);

  // Step 3: 生成技能草稿
  const drafts: SkillDraft[] = [];
  let skillsGenerated = 0;
  let skillsUpdated = 0;

  // 从工具调用模式生成
  for (const { pattern, count } of report.toolPatterns) {
    // 找出相关的会话
    const related = sessions.filter((s) =>
      pattern.split(" → ").every((tool) => s.toolCalls.includes(tool))
    );

    const draft = generateSkillFromToolPattern(pattern, count, related);

    // 质量检查：检查是否已有相似技能
    const existing = await findSimilarSkill(draft);
    if (existing) {
      console.log(`[SkillLearner] 跳过（已存在相似技能）: ${draft.name} → ${existing}`);
      skillsUpdated++;
      continue;
    }

    drafts.push(draft);
  }

  // 从文件访问模式生成
  for (const { pattern, count } of report.filePatterns) {
    const related = sessions.filter((s) => {
      const sExts = [...new Set(s.filesAccessed.map((f) => {
        const ext = path.extname(f);
        return ext || "no-ext";
      }))];
      return sExts.join("+") === pattern;
    });

    const draft = generateSkillFromFilePattern(pattern, count, related);
    if (!draft) continue;

    const existing = await findSimilarSkill(draft);
    if (existing) {
      console.log(`[SkillLearner] 跳过（已存在相似技能）: ${draft.name} → ${existing}`);
      skillsUpdated++;
      continue;
    }

    drafts.push(draft);
  }

  // Step 4: 保存技能草稿
  for (const draft of drafts) {
    try {
      const filePath = await saveSkillDraft(draft);
      console.log(`[SkillLearner] 生成技能: ${draft.name} → ${filePath}`);
      skillsGenerated++;
    } catch (err: any) {
      console.error(`[SkillLearner] 保存失败: ${draft.name} - ${err.message}`);
    }
  }

  // 生成模式列表（用于报告）
  const patterns: WorkflowPattern[] = [
    ...report.toolPatterns.map(({ pattern, count }, i) => ({
      id: `tool_${i}`,
      name: pattern.split(" → ").join(" → "),
      description: `工具调用序列`,
      occurrences: count,
      toolSequence: pattern.split(" → "),
      filePatterns: [],
      sampleSessions: [],
      confidence: Math.min(1, count / 5),
    })),
    ...report.filePatterns.map(({ pattern, count }, i) => ({
      id: `file_${i}`,
      name: pattern,
      description: `文件类型组合`,
      occurrences: count,
      toolSequence: [],
      filePatterns: [pattern],
      sampleSessions: [],
      confidence: Math.min(1, count / 5),
    })),
  ];

  console.log(`[SkillLearner] 完成: ${skillsGenerated} 个新技能, ${skillsUpdated} 个已存在`);

  return {
    analyzedAt: Date.now(),
    sessionsAnalyzed: sessions.length,
    patternsFound: patterns.length,
    skillsGenerated,
    skillsUpdated,
    patterns,
    drafts,
  };
}

/**
 * 创建空报告
 */
function createEmptyReport(): AnalysisReport {
  return {
    analyzedAt: Date.now(),
    sessionsAnalyzed: 0,
    patternsFound: 0,
    skillsGenerated: 0,
    skillsUpdated: 0,
    patterns: [],
    drafts: [],
  };
}

/**
 * 获取学习状态（用于 UI 显示）
 */
export async function getLearningStatus(): Promise<{
  lastRun: number | null;
  totalSessions: number;
  pendingDrafts: number;
}> {
  // TODO: 从配置文件或数据库读取状态
  return {
    lastRun: null,
    totalSessions: 0,
    pendingDrafts: 0,
  };
}
