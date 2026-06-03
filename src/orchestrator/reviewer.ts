/**
 * 验收器 (Reviewer)
 *
 * 职责：审查 sub-agent 的产出，检查一致性、规范、契约
 * 原理：主 Agent 读取所有 diff，做结构化审查
 */

import type { TaskPlan, TaskResult, ReviewResult, ReviewIssue, FileDiff, Contract } from "./types.js";

// ── 验收 Prompt 模板 ──

const REVIEW_SYSTEM = `你是一个代码验收专家。你的工作是审查多个开发者的产出，确保代码质量。

## 审查维度

1. **规范合规**: 代码是否符合项目规章制度
2. **契约一致**: 前后端接口是否匹配（类型、字段名、格式）
3. **完整性**: 每个任务的产出是否覆盖了需求
4. **冲突检测**: 多个任务是否修改了同一个文件
5. **安全性**: 是否有明显的安全漏洞

## 输出格式

严格输出 JSON：

{
  "approved": true|false,
  "summary": "验收结论",
  "issues": [
    {
      "severity": "error|warning|info",
      "taskId": "相关任务 id",
      "file": "相关文件",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "fixes": [
    {
      "path": "文件路径",
      "action": "create|modify",
      "content": "修复后的完整内容",
      "description": "修复说明"
    }
  ]
}

## 判断标准

- approved=true: 没有 severity=error 的问题
- approved=false: 有 severity=error 的问题需要修复

## 你会自己修复的情况

- 小的格式问题（缩进、引号风格）
- 明显的类型不匹配
- 遗漏的 import
- 简单的命名不一致

大的逻辑问题不会自己修，标记为 error 让 sub-agent 重做。`;

/**
 * 构建验收 prompt
 */
export function buildReviewPrompt(
  plan: TaskPlan,
  results: TaskResult[]
): { system: string; user: string } {
  const parts: string[] = [];

  // 任务计划概要
  parts.push("## 任务计划");
  parts.push(`目标: ${plan.summary}`);
  parts.push(`分解思路: ${plan.reasoning}`);
  parts.push("");

  // 相关规章
  if (plan.rules.length > 0) {
    parts.push("## 项目规章");
    plan.rules.forEach((r) => parts.push(`- ${r}`));
    parts.push("");
  }

  // 契约
  if (plan.contracts.length > 0) {
    parts.push("## 接口契约");
    plan.contracts.forEach((c) => {
      parts.push(`### ${c.name}`);
      parts.push("```");
      parts.push(c.definition);
      parts.push("```");
    });
    parts.push("");
  }

  // 各 sub-agent 的产出
  parts.push("## 各任务产出");
  for (const result of results) {
    const task = plan.tasks.find((t) => t.id === result.taskId);
    parts.push(`\n### 任务: ${task?.title || result.taskId}`);
    parts.push(`状态: ${result.status}`);
    parts.push(`决策说明: ${result.reasoning}`);

    if (result.diff.length > 0) {
      parts.push("\n文件变更:");
      result.diff.forEach((d) => {
        parts.push(`\n#### ${d.action}: ${d.path}`);
        parts.push(`说明: ${d.description}`);
        if (d.content) {
          parts.push("```");
          parts.push(d.content.slice(0, 4000));
          parts.push("```");
        }
      });
    }

    if (result.issues.length > 0) {
      parts.push("\n遇到的问题:");
      result.issues.forEach((i) => parts.push(`- ${i}`));
    }

    if (result.questions.length > 0) {
      parts.push("\n提出的问题:");
      result.questions.forEach((q) => parts.push(`- ${q}`));
    }
  }

  // 冲突检测提示
  const allFiles = results.flatMap((r) => r.diff.map((d) => d.path));
  const duplicates = allFiles.filter((f, i) => allFiles.indexOf(f) !== i);
  if (duplicates.length > 0) {
    parts.push("\n## ⚠ 检测到文件冲突");
    parts.push("以下文件被多个任务修改:");
    [...new Set(duplicates)].forEach((f) => parts.push(`- ${f}`));
    parts.push("请重点审查这些文件的一致性。");
  }

  return { system: REVIEW_SYSTEM, user: parts.join("\n") };
}

/**
 * 解析验收结果
 */
export function parseReviewResult(raw: string): ReviewResult {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");

  const fallback: ReviewResult = {
    approved: false,
    summary: "无法解析验收结果",
    issues: [{ severity: "error", message: "验收解析失败" }],
    fixes: [],
  };

  if (start === -1 || end === -1) return fallback;

  try {
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return {
      approved: Boolean(parsed.approved),
      summary: parsed.summary || "",
      issues: (parsed.issues || []).map((i: any): ReviewIssue => ({
        severity: validateSeverity(i.severity),
        taskId: i.taskId,
        file: i.file,
        line: i.line,
        message: i.message || "",
        suggestion: i.suggestion,
      })),
      fixes: (parsed.fixes || []).map((f: any): FileDiff => ({
        path: f.path || "",
        action: f.action || "modify",
        content: f.content,
        description: f.description || "",
      })),
    };
  } catch {
    return fallback;
  }
}

function validateSeverity(s: string): ReviewIssue["severity"] {
  const valid: ReviewIssue["severity"][] = ["error", "warning", "info"];
  return valid.includes(s as any) ? (s as any) : "info";
}
