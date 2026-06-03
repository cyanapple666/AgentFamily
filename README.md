# Agent Family

基于 Pi SDK 的 AI Agent 开发项目，多 Agent 协作 + 记忆系统 + 桌面应用。

## 项目特性

- 🤖 **多 Agent 协作**: 支持多个 Agent 之间的协作和任务分配
- 🧠 **记忆系统**: 持久化的 Agent 记忆存储
- 💻 **桌面应用**: 使用 Electron 构建的跨平台桌面应用
- 🔌 **扩展系统**: 支持插件扩展机制
- 🌐 **WebSocket 通信**: 实时双向通信支持

## 技术栈

- **框架**: React + TypeScript
- **构建工具**: Vite
- **桌面框架**: Electron
- **状态管理**: Zustand
- **HTTP 框架**: Hono
- **AI SDK**: Pi Agent Core

## 项目结构

```
├── src/                    # 核心业务逻辑
│   ├── agent/              # Agent 创建和配置
│   ├── memory/             # 记忆系统
│   ├── orchestrator/       # 任务编排器
│   ├── session/            # 会话管理
│   └── tools/              # 工具函数
├── renderer/               # 前端渲染层
│   ├── components/         # React 组件
│   └── hooks/              # 自定义 Hooks
├── electron/               # Electron 主进程
├── extensions/             # 扩展插件
└── docs/                   # 文档
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 启动后端服务
npm run dev

# 启动前端开发服务器
npm run dev:renderer

# 启动独立服务器
npm run dev:server

# 启动 Electron 应用
npm run dev:electron
```

### 构建

```bash
# 构建前端
npm run build

# 类型检查
npm run typecheck
```

## 环境配置

复制 `.env.example` 文件并修改配置：

```bash
cp .env.example .env
```

配置项说明：
- `PI_API_KEY`: Pi API 密钥
- `PORT`: 服务器端口

## 使用示例

```typescript
import { createAgent } from './src/agent/createAgent';

const agent = await createAgent({
  name: 'MyAgent',
  description: '一个示例 Agent',
});

const response = await agent.run('你好，世界！');
console.log(response);
```

## 扩展开发

在 `extensions/` 目录下创建新的扩展文件：

```typescript
export const weatherExtension = {
  name: 'weather',
  description: '天气查询扩展',
  tools: [
    // 工具定义
  ],
};
```

## 许可证

MIT License
