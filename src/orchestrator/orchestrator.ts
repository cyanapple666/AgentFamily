/**
 * 编排器 (Orchestrator)
 *
 * 核心协调者，串联 Decomposer → Executor → Reviewer 的完整流程。
 * 通过 WebSocket 向前端推送进度事件。
 */

import type {
  Task, TaskPlan, TaskResult, ReviewResult, OrchestratorState,
  OrchestratorEvent, ProjectRules, AgentStyle, Contract,
} from "./types.js";
import { buildDecomposePrompt, parseDecomposeResult } from "./decomposer.js";
import { buildSubAgentContext, buildSubAgentPrompt, buildSubAgentTaskPrompt, parseTaskResult, getDefaultStyle } from "./executor.js";
import { buildReviewPrompt, parseReviewResult } from "./reviewer.js";

// ── Agent 工厂接口 ──
// 具体的 Agent 创建由外部注入，编排器不直接依赖模型 SDK

export interface AgentFactory {
  /**
   * 创建一个一次性 Agent，执行 prompt 后返回完整文本
   * @param systemPrompt  系统提示词
   * @param userPrompt    用户提示词
   * @param modelId       可选模型覆盖
   */
  createAndRun(
    systemPrompt: string,
    userPrompt: string,
    modelId?: string,
    onDelta?: (delta: string) => void,
  ): Promise<string>;
}

export interface FileService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<{ name: string; isDir: boolean; path: string }[]>;
}

export interface OrchestratorDeps {
  agentFactory: AgentFactory;
  fileService: FileService;
  projectRoot: string;
  rules: ProjectRules[];
  customStyles?: Record<string, AgentStyle>;  // 用户自定义风格
  onEvent: (event: OrchestratorEvent) => void; // 事件推送
}

/**
 * 编排器主流程
 */
export async function runOrchestrator(
  userRequest: string,
  deps: OrchestratorDeps
): Promise<{ plan: TaskPlan; results: TaskResult[]; review: ReviewResult; answer: string }> {
  const { agentFactory, fileService, projectRoot, rules, customStyles, onEvent } = deps;

  // ═══ Phase 1: 分析 + 分解 ═══
  onEvent({ type: "plan_start" });

  // 收集项目上下文
  const projectContext = await gatherProjectContext(fileService, projectRoot);
  const fileTree = await getFileTree(fileService, projectRoot);

  const { system, user } = buildDecomposePrompt(userRequest, rules, projectContext, fileTree);

  const rawPlan = await agentFactory.createAndRun(system, user, undefined, (delta) => {
    onEvent({ type: "plan_delta", delta });
  });

  const plan = parseDecomposeResult(rawPlan);
  if (!plan) {
    throw new Error("任务分解失败：无法解析 LLM 输出");
  }

  onEvent({ type: "plan_ready", plan });

  // ═══ Phase 2: 并行执行 ═══
  const results: TaskResult[] = [];
  const executionGroups = topologicalSort(plan);

  for (const group of executionGroups) {
    // 同组任务并行执行
    const promises = group.map(async (task) => {
      onEvent({ type: "task_start", taskId: task.id });

      try {
        const result = await executeTask(task, plan, agentFactory, fileService, projectRoot, customStyles);
        results.push(result);
        onEvent({ type: "task_done", taskId: task.id, result });
      } catch (err: any) {
        const errorResult: TaskResult = {
          taskId: task.id,
          status: "failed",
          diff: [],
          reasoning: "",
          issues: [err.message],
          questions: [],
          filesRead: [],
          filesWritten: [],
        };
        results.push(errorResult);
        onEvent({ type: "task_error", taskId: task.id, error: err.message });
      }
    });

    await Promise.all(promises);
  }

  // ═══ Phase 3: 验收 ═══
  onEvent({ type: "review_start" });

  const { system: reviewSystem, user: reviewUser } = buildReviewPrompt(plan, results);
  const rawReview = await agentFactory.createAndRun(reviewSystem, reviewUser, undefined, (delta) => {
    onEvent({ type: "review_delta", delta });
  });

  const review = parseReviewResult(rawReview);

  // 应用验收修复
  if (review.fixes.length > 0) {
    for (const fix of review.fixes) {
      if (fix.content) {
        await fileService.writeFile(fix.path, fix.content);
      }
    }
  }

  // 应用 sub-agent 的产出（通过验收的部分）
  for (const result of results) {
    if (result.status === "success" || result.status === "partial") {
      for (const diff of result.diff) {
        if (diff.content && diff.action !== "delete") {
          await fileService.writeFile(diff.path, diff.content);
        }
      }
    }
  }

  onEvent({ type: "review_done", result: review });

  // ═══ 生成最终回答 ═══
  const answer = buildFinalAnswer(plan, results, review);
  onEvent({ type: "final_answer", content: answer });

  return { plan, results, review, answer };
}

// ── 辅助函数 ──

/**
 * 执行单个任务
 */
async function executeTask(
  task: TaskPlan["tasks"][number],
  plan: TaskPlan,
  agentFactory: AgentFactory,
  fileService: FileService,
  projectRoot: string,
  customStyles?: Record<string, AgentStyle>,
): Promise<TaskResult> {
  // 选择风格：用户自定义 > 默认
  const style = customStyles?.[task.type] || getDefaultStyle(task.type);

  // 读取需要参考的文件
  const fileContents: Record<string, string> = {};
  for (const filePath of task.files) {
    try {
      const fullPath = filePath.startsWith("/") ? filePath : `${projectRoot}/${filePath}`;
      fileContents[filePath] = await fileService.readFile(fullPath);
    } catch {
      // 文件不存在，跳过
    }
  }

  // 构建上下文
  const ctx = buildSubAgentContext(task, style, plan.rules, plan.contracts, projectRoot, fileContents);
  const systemPrompt = buildSubAgentPrompt(ctx);
  const userPrompt = buildSubAgentTaskPrompt(ctx, fileContents);

  // 执行
  const raw = await agentFactory.createAndRun(systemPrompt, userPrompt, style.model);
  return parseTaskResult(task.id, raw);
}

/**
 * 拓扑排序：把任务分成可并行的执行组
 */
function topologicalSort(plan: TaskPlan): Task[][] {
  const { tasks, dependencies } = plan;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map(tasks.map((t) => [t.id, 0]));
  const adj = new Map<string, string[]>();

  for (const t of tasks) {
    adj.set(t.id, []);
  }

  for (const dep of dependencies) {
    adj.get(dep.from)?.push(dep.to);
    inDegree.set(dep.to, (inDegree.get(dep.to) ?? 0) + 1);
  }

  const groups: Task[][] = [];
  const queue = tasks.filter((t) => (inDegree.get(t.id) || 0) === 0);

  while (queue.length > 0) {
    groups.push([...queue]);
    const next: typeof queue = [];

    for (const task of queue) {
      for (const neighbor of adj.get(task.id) || []) {
        const deg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) {
          const t = taskMap.get(neighbor);
          if (t) next.push(t);
        }
      }
    }

    queue.length = 0;
    queue.push(...next);
  }

  // 处理没有被依赖图覆盖的任务
  const covered = new Set(groups.flat().map((t) => t.id));
  const uncovered = tasks.filter((t) => !covered.has(t.id));
  if (uncovered.length > 0) groups.push(uncovered);

  return groups;
}

/**
 * 收集项目上下文
 */
async function gatherProjectContext(fs: FileService, root: string): Promise<string> {
  const parts: string[] = [];

  // 尝试读取 package.json
  try {
    const pkg = await fs.readFile(`${root}/package.json`);
    const parsed = JSON.parse(pkg);
    parts.push(`项目名: ${parsed.name}`);
    parts.push(`描述: ${parsed.description || "无"}`);
    parts.push(`依赖: ${Object.keys(parsed.dependencies || {}).join(", ")}`);
  } catch {}

  // 尝试读取 README
  try {
    const readme = await fs.readFile(`${root}/README.md`);
    parts.push(`\nREADME 摘要:\n${readme.slice(0, 1000)}`);
  } catch {}

  return parts.join("\n") || "（无项目上下文）";
}

/**
 * 获取文件树
 */
async function getFileTree(fs: FileService, root: string, depth = 2): Promise<string> {
  const lines: string[] = [];

  async function walk(dir: string, prefix: string, currentDepth: number) {
    if (currentDepth > depth) return;
    try {
      const entries = await fs.listDir(dir);
      const filtered = entries
        .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "sessions")
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 30); // 限制每个目录最多 30 项

      for (const entry of filtered) {
        lines.push(`${prefix}${entry.isDir ? "📁" : "📄"} ${entry.name}`);
        if (entry.isDir) {
          await walk(`${dir}/${entry.name}`, prefix + "  ", currentDepth + 1);
        }
      }
    } catch {}
  }

  await walk(root, "", 0);
  return lines.join("\n") || "（空项目）";
}

/**
 * 生成最终回答
 */
function buildFinalAnswer(
  plan: TaskPlan,
  results: TaskResult[],
  review: ReviewResult
): string {
  const parts: string[] = [];

  parts.push(`## 任务完成: ${plan.summary}`);
  parts.push("");

  // 执行概况
  const success = results.filter((r) => r.status === "success").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;

  parts.push(`**执行结果**: ${success} 成功 / ${partial} 部分完成 / ${failed} 失败`);
  parts.push("");

  // 各任务详情
  parts.push("### 各任务产出");
  for (const result of results) {
    const task = plan.tasks.find((t) => t.id === result.taskId);
    const icon = result.status === "success" ? "✅" : result.status === "partial" ? "⚠️" : "❌";
    parts.push(`\n${icon} **${task?.title || result.taskId}**`);
    parts.push(`   ${result.reasoning}`);
    if (result.filesWritten.length > 0) {
      parts.push(`   文件: ${result.filesWritten.join(", ")}`);
    }
  }

  // 验收结论
  parts.push("");
  parts.push(`### 验收: ${review.approved ? "✅ 通过" : "❌ 需要修复"}`);
  parts.push(review.summary);

  if (review.issues.length > 0) {
    parts.push("\n发现的问题:");
    review.issues.forEach((i) => {
      const icon = i.severity === "error" ? "🔴" : i.severity === "warning" ? "🟡" : "ℹ️";
      parts.push(`  ${icon} ${i.message}`);
      if (i.suggestion) parts.push(`     建议: ${i.suggestion}`);
    });
  }

  return parts.join("\n");
}
