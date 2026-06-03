# 多 Agent 编排架构设计

## 核心理念

单 Agent 的问题：上下文窗口被填满后，注意力衰减，幻觉增加，任务遗忘。
解法：用主 Agent 做编排，sub-agent 做执行，每个 sub-agent 只拿到聚焦的上下文。

## 架构总览

```
用户输入
  │
  ▼
┌─────────────────────────────────────────┐
│           Main Agent (Orchestrator)      │
│                                          │
│  1. 理解用户意图                          │
│  2. 检索项目规章制度 (Rules)              │
│  3. 拆解任务 → TaskPlan                  │
│  4. 分配 sub-agent 并行执行              │
│  5. 收集结果，验收整合                    │
│  6. 返回最终结果给用户                    │
└──────┬──────────┬──────────┬────────────┘
       │          │          │
       ▼          ▼          ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ Sub-1   │ │ Sub-2   │ │ Sub-3   │
  │ Frontend│ │ Backend │ │ UI/Art  │
  │         │ │         │ │         │
  │ 只拿到： │ │ 只拿到： │ │ 只拿到： │
  │ - 任务   │ │ - 任务   │ │ - 任务   │
  │ - 规章   │ │ - 规章   │ │ - 规章   │
  │ - 风格   │ │ - 风格   │ │ - 风格   │
  │ - 契约   │ │ - 契约   │ │ - 契约   │
  └────┬────┘ └────┬────┘ └────┬────┘
       │          │          │
       ▼          ▼          ▼
  ┌─────────────────────────────────────┐
  │          TaskResult[]               │
  │  diff + 决策说明 + 遇到的问题       │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────┐
  │         Main Agent Review           │
  │  - 验证代码是否符合规范              │
  │  - 检查接口一致性                    │
  │  - 整合多个 diff                    │
  │  - 决定通过 / 驳回 / 追加修复       │
  └─────────────────────────────────────┘
```

## 关键设计

### 1. 任务分解 (Decomposition)

主 Agent 把用户输入拆成 TaskPlan：

```typescript
interface TaskPlan {
  summary: string;          // 一句话概括
  rules: string[];          // 适用的规章条目
  tasks: Task[];            // 可并行的任务列表
  contracts: Contract[];    // 任务间的数据契约
  dependencies: Dependency[]; // 任务依赖关系
}

interface Task {
  id: string;
  type: "frontend" | "backend" | "ui" | "test" | "docs" | "config";
  title: string;
  description: string;      // 给 sub-agent 的完整任务描述
  constraints: string[];    // 硬约束（必须遵守）
  files: string[];          // 涉及的文件路径
  output: string[];         // 预期产出的文件
}
```

### 2. Sub-Agent 上下文模板

每个 sub-agent 收到的 prompt 结构：

```
## 你是谁
{agentStyle}  // 用户自定义的做事风格

## 项目规章制度（必须遵守）
{rules}  // 精简后的规则，只包含与本任务相关的

## 数据契约（接口约定）
{contracts}  // API schema、类型定义等

## 你的任务
{task.description}

## 约束
{task.constraints}

## 工作目录
{projectRoot}
```

关键点：sub-agent 看不到整个项目历史，看不到其他 sub-agent 的任务，只看到自己需要的。

### 3. 并行执行模型

```
Phase 1: 分析 + 分解 (主 Agent)
Phase 2: 并行执行 (Sub-Agents)  ← 多个同时跑
Phase 3: 验收整合 (主 Agent)
```

Phase 2 的 sub-agent 之间没有依赖时完全并行。
有依赖时按 DAG 拓扑排序，分层并行。

### 4. 验收流程

主 Agent 的验收不是"看看代码对不对"，而是：

1. **Diff 审查**: 读取每个 sub-agent 产出的文件差异
2. **契约校验**: 检查前后端接口是否一致
3. **规范检查**: 代码是否符合项目规章
4. **集成测试**: 合并后的代码是否能运行
5. **决策**: 通过 / 驳回并指定修复点 / 主 Agent 自己补刀

### 5. Sub-Agent 风格系统

每个 sub-agent 有用户可定义的风格描述：

```typescript
interface AgentStyle {
  id: string;
  name: string;
  description: string;    // 做事风格、偏好、原则
  expertise: string[];    // 擅长领域
  model?: string;         // 可以用不同模型
}
```

预置风格：
- **前端开发**: 注重用户体验、组件化、响应式、无障碍
- **后端开发**: 注重安全性、性能、错误处理、日志
- **UI 设计**: 注重视觉层次、一致性、品牌感
- **测试人员**: 注重边界条件、覆盖率、回归测试
