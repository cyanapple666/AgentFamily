/**
 * 任务分解器 (Decomposer)
 *
 * 职责：把用户需求拆成 TaskPlan
 * 原理：用一个独立的 Agent（轻量模型）做结构化分析，
 *       输出 JSON 格式的任务计划。
 */

import type { TaskPlan, Task, Contract, Dependency, ProjectRules } from "./types.js";

// ── 分解 Prompt 模板 ──

const DECOMPOSE_SYSTEM = `你是一个项目任务分解专家。你的工作是把用户需求拆解成可并行执行的子任务。

## 输出格式

严格输出 JSON，不要任何其他文字：

{
  "summary": "一句话概括用户需求",
  "reasoning": "分解思路：为什么这样拆、考虑了什么",
  "rules": ["从项目规章中提取的相关条目"],
  "tasks": [
    {
      "id": "task_1",
      "type": "frontend|backend|ui|test|docs|config",
      "title": "任务标题",
      "description": "给执行者的完整任务描述，包含：做什么、为什么做、验收标准",
      "constraints": ["硬约束，必须遵守"],
      "files": ["需要参考的现有文件路径"],
      "output": ["预期产出的文件路径"],
      "relatedContracts": ["相关的契约 id"]
    }
  ],
  "contracts": [
    {
      "id": "contract_1",
      "type": "api|type|schema|event",
      "name": "契约名称",
      "definition": "JSON Schema 或 TypeScript 类型定义",
      "producer": "产出方 task id",
      "consumers": ["消费方 task id"]
    }
  ],
  "dependencies": [
    {
      "from": "先完成的 task id",
      "to": "后执行的 task id",
      "reason": "依赖原因"
    }
  ]
}

## 分解原则

1. **最小上下文原则**: 每个任务只包含执行者需要的信息，不要把整个项目塞进去
2. **接口先行**: 如果前后端需要交互，先定义契约（API schema、类型），再拆任务
3. **并行优先**: 尽量让任务之间没有依赖，可以同时执行
4. **单一职责**: 每个任务只做一件事，不要把前端和后端混在一个任务里
5. **可验证**: 每个任务的 output 应该是具体的文件路径，不是模糊的"完成某功能"

## 任务类型说明

- frontend: 前端组件、页面、交互逻辑
- backend: 后端 API、数据库、业务逻辑
- ui: 视觉设计、样式、图标、动画
- test: 测试用例、测试脚本
- docs: 文档、注释、README
- config: 配置文件、构建脚本、环境设置

## 约束要求

constraints 必须具体可执行，不要写"写好代码"这种废话。要写：
- "所有组件必须使用 TypeScript，不允许 any"
- "API 必须返回 { code, data, message } 格式"
- "样式使用 CSS 变量，不写死颜色值"

## 项目现有规章

以下规章必须遵守：`;

/**
 * 构建分解 prompt
 */
export function buildDecomposePrompt(
  userRequest: string,
  rules: ProjectRules[],
  projectContext: string,
  fileTree?: string
): { system: string; user: string } {
  // 按优先级筛选规章
  const relevantRules = rules
    .filter((r) => r.priority === "must" || r.priority === "should")
    .map((r) => `- [${r.priority}] ${r.category}: ${r.content}`)
    .join("\n");

  const system = DECOMPOSE_SYSTEM + "\n" + (relevantRules || "（暂无特殊规章）");

  const userParts = [
    `## 用户需求\n${userRequest}`,
    "",
    "## 项目上下文",
    projectContext || "（无额外上下文）",
  ];

  if (fileTree) {
    userParts.push("", "## 项目文件结构", fileTree);
  }

  userParts.push(
    "",
    "## 要求",
    "分析用户需求，输出 JSON 格式的任务计划。",
    "如果需求涉及多个领域（如前后端），定义好接口契约再拆任务。",
    "如果需求很简单（如只改一个文件），直接一个任务就够了，不要过度拆分。"
  );

  return { system, user: userParts.join("\n") };
}

/**
 * 解析分解结果（从 LLM 输出中提取 JSON）
 */
export function parseDecomposeResult(raw: string): TaskPlan | null {
  // 尝试从 markdown code block 中提取
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  // 找到第一个 { 和最后一个 }
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return normalizePlan(parsed);
  } catch {
    return null;
  }
}

/**
 * 标准化任务计划（填充默认值、验证结构）
 */
function normalizePlan(raw: any): TaskPlan {
  const tasks: Task[] = (raw.tasks || []).map((t: any, i: number) => ({
    id: t.id || `task_${i + 1}`,
    type: validateTaskType(t.type),
    title: t.title || `任务 ${i + 1}`,
    description: t.description || "",
    constraints: t.constraints || [],
    files: t.files || [],
    output: t.output || [],
    relatedContracts: t.relatedContracts || [],
  }));

  const contracts: Contract[] = (raw.contracts || []).map((c: any, i: number) => ({
    id: c.id || `contract_${i + 1}`,
    type: c.type || "api",
    name: c.name || `契约 ${i + 1}`,
    definition: c.definition || "",
    producer: c.producer || "",
    consumers: c.consumers || [],
  }));

  const dependencies: Dependency[] = (raw.dependencies || []).map((d: any) => ({
    from: d.from || "",
    to: d.to || "",
    reason: d.reason || "",
  }));

  return {
    summary: raw.summary || "",
    reasoning: raw.reasoning || "",
    rules: raw.rules || [],
    tasks,
    contracts,
    dependencies,
  };
}

function validateTaskType(type: string): Task["type"] {
  const valid = ["frontend", "backend", "ui", "test", "docs", "config"];
  return (valid.includes(type) ? type : "config") as Task["type"];
}
