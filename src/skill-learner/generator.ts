/**
 * 技能生成器
 *
 * 将分析出的模式转换为 SKILL.md 文件：
 * - 规则匹配生成（Phase 1）
 * - LLM 辅助生成（Phase 2）
 * - 质量检查和去重
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WorkflowPattern, SkillDraft, SessionSummary } from "./types.js";

const SKILLS_DIR = path.resolve(process.cwd(), "skills");

/**
 * 从工具调用模式生成技能草稿
 */
export function generateSkillFromToolPattern(
  pattern: string,
  count: number,
  relatedSessions: SessionSummary[]
): SkillDraft {
  const steps = pattern.split(" → ");
  const name = generateSkillName(steps);
  const description = generateDescription(steps, count);
  const triggers = generateTriggers(steps);

  const content = buildSkillMd(name, description, triggers, steps, relatedSessions);

  return {
    id: `auto_${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    description,
    triggers,
    content,
    sourcePattern: {
      id: `pattern_${Date.now()}`,
      name,
      description,
      occurrences: count,
      toolSequence: steps,
      filePatterns: [],
      sampleSessions: relatedSessions.map((s) => s.id).slice(0, 3),
      confidence: Math.min(1, count / 5),
    },
    status: "pending",
    createdAt: Date.now(),
  };
}

/**
 * 从文件访问模式生成技能草稿
 */
export function generateSkillFromFilePattern(
  pattern: string,
  count: number,
  relatedSessions: SessionSummary[]
): SkillDraft | null {
  const exts = pattern.split("+").map((e) => e.replace(".", ""));
  if (exts.length < 2) return null; // 单一文件类型不生成技能

  const name = `${exts.join(" & ")} 协作规范`;
  const description = `处理 ${exts.join("、")} 文件时的标准流程`;
  const triggers = exts.map((e) => `处理 ${e} 文件`);

  const content = buildFileSkillMd(name, description, triggers, exts, count);

  return {
    id: `auto_file_${exts.join("-")}`,
    name,
    description,
    triggers,
    content,
    sourcePattern: {
      id: `file_pattern_${Date.now()}`,
      name,
      description,
      occurrences: count,
      toolSequence: [],
      filePatterns: [pattern],
      sampleSessions: relatedSessions.map((s) => s.id).slice(0, 3),
      confidence: Math.min(1, count / 5),
    },
    status: "pending",
    createdAt: Date.now(),
  };
}

/**
 * 检查是否已存在相似技能
 */
export async function findSimilarSkill(draft: SkillDraft): Promise<string | null> {
  try {
    const entries = await fs.readdir(SKILLS_DIR);
    for (const entry of entries) {
      const skillPath = path.join(SKILLS_DIR, entry, "SKILL.md");
      try {
        const content = await fs.readFile(skillPath, "utf-8");
        // 简单相似度检查：名称或描述包含
        if (
          content.includes(draft.name) ||
          content.toLowerCase().includes(draft.description.toLowerCase().slice(0, 20))
        ) {
          return entry;
        }
      } catch {
        // 跳过无法读取的文件
      }
    }
  } catch {
    // 目录不存在
  }
  return null;
}

/**
 * 保存技能草稿到 skills 目录
 */
export async function saveSkillDraft(draft: SkillDraft): Promise<string> {
  const skillDir = path.join(SKILLS_DIR, draft.id);
  await fs.mkdir(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, "SKILL.md");
  await fs.writeFile(skillPath, draft.content, "utf-8");
  return skillPath;
}

/**
 * 生成技能名称
 */
function generateSkillName(steps: string[]): string {
  const toolNames: Record<string, string> = {
    read_file: "文件读取",
    write_file: "文件写入",
    list_directory: "目录浏览",
    bash: "命令执行",
    edit: "文件编辑",
    search: "内容搜索",
  };

  const readable = steps.map((s) => toolNames[s] || s);
  if (readable.length <= 3) {
    return readable.join(" + ");
  }
  return `${readable[0]} → ${readable[readable.length - 1]} 流程`;
}

/**
 * 生成技能描述
 */
function generateDescription(steps: string[], count: number): string {
  return `标准工作流：${steps.join(" → ")}（基于 ${count} 次历史会话）`;
}

/**
 * 生成触发词
 */
function generateTriggers(steps: string[]): string[] {
  const triggers: string[] = [];
  if (steps.includes("write_file") || steps.includes("edit")) {
    triggers.push("创建文件", "修改文件", "写入文件");
  }
  if (steps.includes("read_file")) {
    triggers.push("读取文件", "查看文件");
  }
  if (steps.includes("bash")) {
    triggers.push("运行命令", "执行脚本");
  }
  if (steps.includes("list_directory")) {
    triggers.push("浏览目录", "查看结构");
  }
  return triggers;
}

/**
 * 构建 SKILL.md 内容
 */
function buildSkillMd(
  name: string,
  description: string,
  triggers: string[],
  steps: string[],
  sessions: SessionSummary[]
): string {
  const toolNames: Record<string, string> = {
    read_file: "read_file - 读取文件内容",
    write_file: "write_file - 创建或覆盖文件",
    list_directory: "list_directory - 浏览目录结构",
    bash: "bash - 执行 shell 命令",
    edit: "edit - 精确编辑文件",
    search: "search - 搜索文件内容",
  };

  const stepsList = steps
    .map((s, i) => `${i + 1}. ${toolNames[s] || s}`)
    .join("\n");

  const sessionIds = sessions
    .slice(0, 3)
    .map((s) => `- ${s.title} (${s.id})`)
    .join("\n");

  return `---
name: ${name}
description: ${description}
triggers: ${triggers.join(", ")}
source: auto-learn
created: ${new Date().toISOString()}
---

# ${name}

${description}

## 触发条件

当用户执行以下操作时激活：
${triggers.map((t) => `- ${t}`).join("\n")}

## 标准流程

${stepsList}

## 基于的会话

${sessionIds || "（无示例会话）"}

## 注意事项

- 确保每步操作都有明确的输入输出
- 遇到错误时回退到上一步
- 记录操作结果以便追溯
`;
}

/**
 * 构建文件协作技能的 SKILL.md
 */
function buildFileSkillMd(
  name: string,
  description: string,
  triggers: string[],
  exts: string[],
  count: number
): string {
  return `---
name: ${name}
description: ${description}
triggers: ${triggers.join(", ")}
source: auto-learn
created: ${new Date().toISOString()}
---

# ${name}

${description}（基于 ${count} 次历史会话）

## 触发条件

当用户同时处理以下类型的文件时激活：
${exts.map((e) => `- .${e} 文件`).join("\n")}

## 协作规范

1. 修改文件前先读取相关依赖文件
2. 保持类型定义和实现的一致性
3. 修改后检查是否有遗漏的更新
4. 运行相关测试验证修改

## 注意事项

- 不同类型文件的修改可能有依赖关系
- 优先修改底层定义，再修改上层实现
`;
}
