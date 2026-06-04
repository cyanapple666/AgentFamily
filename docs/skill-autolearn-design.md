# Skill Auto-Learn 设计文档

## 概述

让 agent 自动从用户日常使用中学习，识别可复用的工作流模式，自动生成 SKILL.md 技能文件，提升后续使用体验。

## 触发方式

方案 B：每天定时批量分析（cron job），低频不阻塞正常使用。

## 架构

```
src/skill-learner/
  ├── index.ts          # 入口：调度 + 编排
  ├── analyzer.ts       # 会话分析：提取模式
  ├── generator.ts      # 技能生成：模式 → SKILL.md
  └── types.ts          # 类型定义
```

## 数据流

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Sessions   │───▶│   Analyzer   │───▶│  Generator   │───▶│  skills/     │
│  (历史会话)  │    │  (模式识别)   │    │  (技能生成)   │    │  (SKILL.md)  │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │                  │                   │                    │
       ▼                  ▼                   ▼                    ▼
  读取 JSON          LLM 分析            生成技能文件          写入磁盘
  提取工具链         聚类相似会话         质量检查             通知用户
```

## 核心流程

### Step 1: 数据采集

从 `sessions/` 目录读取最近 N 天的会话，提取：
- 用户消息内容（意图）
- 工具调用序列（read_file → write_file → bash 等）
- 文件访问模式（哪些文件被反复操作）
- 会话时长和复杂度

### Step 2: 模式识别

用 LLM 分析会话摘要，识别：

| 模式类型 | 示例 |
|---------|------|
| 重复工作流 | "每次创建组件都用 hooks + TypeScript + CSS 变量" |
| 工具链模式 | "先 read_file 了解结构，再 write_file 创建，最后 bash 验证" |
| 项目规范 | "所有组件都要有 Props 接口定义" |
| 部署流程 | "改完代码后跑 lint → test → build" |

### Step 3: 技能生成

将识别出的模式转换为 SKILL.md 格式：

```markdown
---
name: react-component-creation
description: 创建 React 组件的标准流程
triggers: 创建组件, 新建组件, add component
---

# React 组件创建

## 触发条件
用户要求创建新的 React 组件时激活。

## 步骤
1. 确认组件名称和职责
2. 创建 TypeScript 接口定义
3. 使用函数式组件 + hooks
4. CSS 使用变量，不写死颜色
5. 导出默认组件

## 规范
- 文件命名：PascalCase.tsx
- 目录位置：src/components/
- 必须有 Props 接口
```

### Step 4: 质量控制

| 检查项 | 阈值 |
|-------|------|
| 最少出现次数 | ≥ 3 次 |
| 相似度检查 | 与已有技能对比，>80% 则合并 |
| 人工确认 | 生成后不自动启用，等用户确认 |
| 时效性 | 只分析最近 7 天的会话 |

## 类型定义

```typescript
// src/skill-learner/types.ts

/** 从会话中提取的模式 */
interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  occurrences: number;        // 出现次数
  toolSequence: string[];     // 工具调用序列
  filePatterns: string[];     // 文件访问模式
  sampleSessions: string[];   // 示例会话 ID
  confidence: number;         // 置信度 0-1
}

/** 生成的技能草稿 */
interface SkillDraft {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  content: string;            // SKILL.md 内容
  sourcePattern: WorkflowPattern;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

/** 分析报告 */
interface AnalysisReport {
  analyzedAt: number;
  sessionsAnalyzed: number;
  patternsFound: number;
  skillsGenerated: number;
  skillsUpdated: number;
  patterns: WorkflowPattern[];
  drafts: SkillDraft[];
}
```

## 调度实现

在 `electron/server.ts` 中添加定时任务：

```typescript
// 每天凌晨 3 点运行
import { analyzeAndGenerate } from "../src/skill-learner/index.js";

function startSkillLearner() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(3, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  
  const delay = target.getTime() - now.getTime();
  setTimeout(async () => {
    console.log("[SkillLearner] 开始每日分析...");
    const report = await analyzeAndGenerate();
    console.log(`[SkillLearner] 完成: ${report.patternsFound} 模式, ${report.skillsGenerated} 新技能`);
    
    // 通知用户
    if (report.skillsGenerated > 0) {
      ws.send(JSON.stringify({
        type: "notification",
        title: "技能学习完成",
        body: `发现 ${report.patternsFound} 个模式，生成 ${report.skillsGenerated} 个新技能`,
      }));
    }
    
    startSkillLearner(); // 递归调度下一次
  }, delay);
}
```

## LLM 分析 Prompt 设计

```typescript
const ANALYSIS_PROMPT = `你是一个工作流分析专家。分析以下用户会话，识别可复用的工作流模式。

## 会话数据
{sessions}

## 分析要求
1. 识别重复出现的工作流（同一类任务、相似的工具调用序列）
2. 提取项目特定的规范和约定
3. 识别用户偏好的代码风格和结构
4. 找出可以自动化的重复步骤

## 输出格式
严格输出 JSON：
{
  "patterns": [
    {
      "name": "模式名称",
      "description": "模式描述",
      "toolSequence": ["工具1", "工具2"],
      "filePatterns": ["文件模式"],
      "occurrences": 出现次数,
      "confidence": 0.0-1.0,
      "triggers": ["触发词1", "触发词2"]
    }
  ]
}

只输出置信度 > 0.6 的模式。`;
```

## 实现优先级

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 基础框架：数据采集 + 简单规则匹配 | 1-2 天 |
| Phase 2 | LLM 分析：模式识别 + 技能生成 | 2-3 天 |
| Phase 3 | 质量控制：阈值检查 + 人工确认 | 1 天 |
| Phase 4 | 集成：定时任务 + 用户通知 | 0.5 天 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| LLM 分析成本高 | 批量处理，控制分析频率 |
| 生成低质量技能 | 高阈值 + 人工确认 |
| 技能冲突 | 相似度检查，合并而非重复 |
| 隐私问题 | 只分析工具调用，不存敏感内容 |
