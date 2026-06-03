/**
 * Sub-Agent 执行器 (Executor)
 *
 * 职责：构建 sub-agent 的上下文，执行任务，收集结果
 * 关键设计：每个 sub-agent 只拿到聚焦的上下文，看不到其他任务
 */

import type { Task, AgentStyle, Contract, SubAgentContext, TaskResult, FileDiff } from "./types.js";

// ── Sub-Agent System Prompt 模板 ──

const SUB_AGENT_SYSTEM = `你是一个专注的执行者。你只做分配给你的任务，不做多余的事。

## 你的身份
{style}

## 工作原则
1. **只改你负责的文件**，不要碰其他文件
2. **先读再改**，用 read_file 读取现有代码，理解后再动手
3. **输出完整的文件内容**，不要用 diff 格式，直接输出完整的新文件
4. **遇到问题说出来**，不要猜，不要编造不存在的 API
5. **保持现有代码风格**，缩进、命名、注释风格与项目一致

## 输出格式

完成任务后，严格输出以下 JSON：

{
  "status": "success|partial|failed|needs_review",
  "reasoning": "你做了什么、为什么这样做",
  "diff": [
    {
      "path": "文件路径",
      "action": "create|modify|delete",
      "content": "完整的文件新内容",
      "description": "这个变更的说明"
    }
  ],
  "issues": ["遇到的问题"],
  "questions": ["需要主 Agent 回答的问题"],
  "filesRead": ["你读取了哪些文件"],
  "filesWritten": ["你写入了哪些文件"]
}

## 项目规章制度
{rules}

## 接口契约
{contracts}
`;

// ── Task Type → Agent Style 映射 ──

const DEFAULT_STYLES: Record<string, AgentStyle> = {
  frontend: {
    id: "frontend",
    name: "前端开发",
    description: `你是一个资深前端开发者。
原则：组件化优先、用户体验至上、响应式设计、无障碍支持。
技术栈：React + TypeScript，使用 CSS 变量做主题。
代码风格：函数式组件、hooks、清晰的 props 类型。
不做的事：不改后端代码、不碰数据库、不做视觉设计。`,
    expertise: ["React", "TypeScript", "CSS", "HTML", "前端架构"],
  },
  backend: {
    id: "backend",
    name: "后端开发",
    description: `你是一个资深后端开发者。
原则：安全性第一、性能优先、完善的错误处理、详细的日志。
技术栈：Node.js + TypeScript。
代码风格：清晰的错误边界、输入验证、类型安全。
不做的事：不改前端代码、不碰 UI、不做视觉设计。`,
    expertise: ["Node.js", "TypeScript", "API 设计", "数据库", "安全"],
  },
  ui: {
    id: "ui",
    name: "UI/美术开发",
    description: `你是一个 UI/视觉开发者。
原则：视觉层次清晰、品牌一致性、细节打磨、动效适度。
技术栈：CSS/SCSS、SVG、CSS 动画。
代码风格：语义化类名、可复用的样式变量、响应式。
不做的事：不写业务逻辑、不碰后端、不做功能开发。`,
    expertise: ["CSS", "SVG", "设计系统", "动画", "视觉设计"],
  },
  test: {
    id: "test",
    name: "测试人员",
    description: `你是一个严谨的测试工程师。
原则：边界条件必测、回归测试覆盖、自动化优先。
代码风格：清晰的测试命名、完整的断言、适当的 mock。
不做的事：不改业务代码、只写测试文件。`,
    expertise: ["单元测试", "集成测试", "测试策略", "边界分析"],
  },
  docs: {
    id: "docs",
    name: "文档编写",
    description: `你是一个技术文档专家。
原则：准确、简洁、有示例、面向读者。
风格：先说结论、再给细节、代码示例完整可运行。`,
    expertise: ["技术写作", "API 文档", "README"],
  },
  config: {
    id: "config",
    name: "配置/DevOps",
    description: `你是一个配置和构建专家。
原则：最小化配置、可复现构建、环境隔离。
不做的事：不写业务代码，只处理配置文件和构建脚本。`,
    expertise: ["构建工具", "CI/CD", "Docker", "环境配置"],
  },
};

/**
 * 获取任务类型对应的默认风格
 */
export function getDefaultStyle(taskType: string): AgentStyle {
  return DEFAULT_STYLES[taskType] || DEFAULT_STYLES.config;
}

/**
 * 构建 Sub-Agent 的完整执行上下文
 */
export function buildSubAgentContext(
  task: Task,
  style: AgentStyle,
  rules: string[],
  contracts: Contract[],
  projectRoot: string,
  fileContents?: Record<string, string>
): SubAgentContext {
  return {
    task,
    style,
    rules,
    contracts: contracts.filter(
      (c) =>
        task.relatedContracts.includes(c.id) ||
        c.producer === task.id ||
        c.consumers.includes(task.id)
    ),
    projectRoot,
    fileContents,
  };
}

/**
 * 构建 Sub-Agent 的 system prompt
 */
export function buildSubAgentPrompt(ctx: SubAgentContext): string {
  const rulesText =
    ctx.rules.length > 0
      ? ctx.rules.map((r) => `- ${r}`).join("\n")
      : "（无特殊约束）";

  const contractsText =
    ctx.contracts.length > 0
      ? ctx.contracts
          .map(
            (c) =>
              `### ${c.name} (${c.type})\n\`\`\`\n${c.definition}\n\`\`\``
          )
          .join("\n\n")
      : "（无接口契约）";

  return SUB_AGENT_SYSTEM
    .replace("{style}", ctx.style.description)
    .replace("{rules}", rulesText)
    .replace("{contracts}", contractsText);
}

/**
 * 构建 Sub-Agent 的 user prompt（任务描述）
 */
export function buildSubAgentTaskPrompt(
  ctx: SubAgentContext,
  fileContents?: Record<string, string>
): string {
  const parts = [
    `## 任务：${ctx.task.title}`,
    "",
    ctx.task.description,
    "",
  ];

  if (ctx.task.constraints.length > 0) {
    parts.push("## 硬约束（必须遵守）");
    ctx.task.constraints.forEach((c) => parts.push(`- ${c}`));
    parts.push("");
  }

  if (ctx.task.output.length > 0) {
    parts.push("## 预期产出文件");
    ctx.task.output.forEach((f) => parts.push(`- ${f}`));
    parts.push("");
  }

  // 注入需要参考的文件内容
  if (fileContents && Object.keys(fileContents).length > 0) {
    parts.push("## 参考文件内容");
    for (const [path, content] of Object.entries(fileContents)) {
      parts.push(`### ${path}`);
      parts.push("```");
      parts.push(content.slice(0, 8000)); // 限制单文件最大 8000 字符
      parts.push("```");
      parts.push("");
    }
  }

  parts.push(
    "## 工作目录",
    ctx.projectRoot,
    "",
    "开始工作。读取必要的文件，完成任务，输出结果 JSON。"
  );

  return parts.join("\n");
}

/**
 * 解析 Sub-Agent 的执行结果
 */
export function parseTaskResult(taskId: string, raw: string): TaskResult {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");

  const fallback: TaskResult = {
    taskId,
    status: "failed",
    diff: [],
    reasoning: raw.slice(0, 500),
    issues: ["无法解析 sub-agent 输出"],
    questions: [],
    filesRead: [],
    filesWritten: [],
  };

  if (start === -1 || end === -1) return fallback;

  try {
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return {
      taskId,
      status: validateStatus(parsed.status),
      diff: (parsed.diff || []).map((d: any): FileDiff => ({
        path: d.path || "",
        action: validateAction(d.action),
        content: d.content,
        description: d.description || "",
      })),
      reasoning: parsed.reasoning || "",
      issues: parsed.issues || [],
      questions: parsed.questions || [],
      filesRead: parsed.filesRead || [],
      filesWritten: parsed.filesWritten || [],
    };
  } catch {
    return fallback;
  }
}

function validateStatus(s: string): TaskResult["status"] {
  const valid: TaskResult["status"][] = ["success", "partial", "failed", "needs_review"];
  return valid.includes(s as any) ? (s as any) : "failed";
}

function validateAction(a: string): FileDiff["action"] {
  const valid: FileDiff["action"][] = ["create", "modify", "delete"];
  return valid.includes(a as any) ? (a as any) : "modify";
}
