/**
 * Agent WebSocket Server（会话级模型+模式）
 *
 * 每个连接绑定 sessionId，模型和访问模式跟着会话走，
 * 切换会话自动恢复该会话的模型和模式。
 */

import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { createAgent } from "../src/agent/createAgent.js";
import { defaultAgent } from "../src/agent/config.js";
import { customTools } from "../src/tools/index.js";
const { readFile, listDirectory, getCurrentTime, webSearch } = customTools.reduce((acc: any, t: any) => ({ ...acc, [t.name]: t }), {});
import { loadExtensions, collectTools } from "../src/extensions/loader.js";
import {
  saveSession,
  loadSession,
  listSessions,
  generateSessionId,
  renameSession,
  archiveSession,
} from "../src/session/store.js";
import { loadSettings, saveSettings } from "./settings.js";
import { memory } from "../src/memory/index.js";
import { runOrchestrator, type AgentFactory, type FileService } from "../src/orchestrator/index.js";

export interface AgentServer { stop: () => void; }

/** 收集 Agent 的完整回复（用于子 Agent 委派） */
async function collectResponse(agent: ReturnType<typeof createAgent>, prompt: string): Promise<string> {
  let result = "";
  let toolCount = 0;
  agent.subscribe((event: any) => {
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      result += event.assistantMessageEvent.delta;
    }
    if (event.type === "tool_execution_end") toolCount++;
  });
  console.log(`[Delegate] 开始委派任务: "${prompt.slice(0, 50)}..."`);
  await agent.prompt(prompt);
  console.log(`[Delegate] 完成, ${toolCount} 次工具调用, 回复长度: ${result.length}`);
  return result || "(无回复)";
}

/** 用 AI 生成会话标题（5-15 字） */
async function generateTitle(userMsg: string, replySnippet: string): Promise<string> {
  try {
    const titleAgent = createAgent(
      { ...defaultAgent, systemPrompt: "只输出5-15字的简短标题，概括这段对话的主题。只输出标题，不要引号、标点、解释。", modelId: "deepseek-v4-flash" },
      [], [], { accessMode: "auto" as any }
    );
    const prompt = `用户: ${userMsg.slice(0, 100)}\n助手: ${replySnippet.slice(0, 100)}\n\n标题:`;
    const title = await collectResponse(titleAgent, prompt);
    return title.replace(/[""'']/g, "").trim().slice(0, 20) || userMsg.slice(0, 15);
  } catch {
    return userMsg.slice(0, 15);
  }
}

export function startServer(port: number): AgentServer {
  const extTools: any[] = [];
  loadExtensions().then((exts) => {
    extTools.push(...collectTools(exts));
    console.log(`[Server] ${extTools.length} 个扩展工具`);
  });

  // 启动时加载已有会话到记忆索引
  import("../src/session/store.js").then(async ({ listSessions, loadSession }) => {
    const sessions = await listSessions();
    for (const s of sessions) {
      const data = await loadSession(s.id);
      if (data) {
        memory.indexSession(s.id, s.title, data.messages, s.updatedAt);
      }
    }
    console.log(`[Memory] 已索引 ${memory.size} 条历史记忆`);
  });

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[Server] 客户端已连接");

    let sessionId = "";
    let agent: ReturnType<typeof createAgent> | null = null;
    let firstMessage = "";
    let currentMode: string = "ask";
    let currentModelId = "deepseek-v4-pro";
    let currentThinking = "off";
    let currentAgentId = "default";
    let prevMsgLen = 0;
    let agentGeneration = 0;
    let sessionTitle = ""; // AI 生成的标题，只设一次 // 代际计数器 // 用于 token 增量估算
    // 权限请求的 Promise resolver
    let pendingPermission: { resolve: (v: boolean) => void } | null = null;

    async function initAgent(msgs?: any[]) {
      const thisGen = ++agentGeneration;
      const settings = await loadSettings();
      const allTools = [...customTools, ...extTools];

      // 获取当前 Agent 配置
      const agentProfile = settings.agents?.find((a) => a.id === currentAgentId) || settings.agents?.[0];
      const basePrompt = agentProfile?.systemPrompt || settings.systemPrompt;
      console.log(`[initAgent] Agent=${currentAgentId} Profile=${agentProfile?.name} Prompt首30字="${basePrompt.slice(0, 30)}"`);

      // 委派工具
      const delegateTool = {
        name: "delegate_to_agent",
        description:
          "委派任务给其他 Agent。可用: " +
          (settings.agents?.map((a: any) => a.id + "=" + a.name).join(", ") || "default=默认助手"),
        parameters: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "目标 Agent ID" },
            task: { type: "string", description: "任务描述" },
          },
          required: ["agentId", "task"],
        },
        async execute(_id: string, params: { agentId: string; task: string }, _signal: AbortSignal) {
          const profile = settings.agents?.find((a: any) => a.id === params.agentId);
          if (!profile) return { content: [{ type: "text" as const, text: "找不到: " + params.agentId }], details: {} };
          try {
            const sub = createAgent(
              { ...defaultAgent, systemPrompt: profile.systemPrompt, modelId: "deepseek-v4-flash" },
              [readFile, listDirectory, getCurrentTime, webSearch], [], { accessMode: "auto" as any }
            );
            const text = await collectResponse(sub, params.task);
            return { content: [{ type: "text" as const, text: "[" + profile.name + "] " + text }], details: {} };
          } catch (err: any) {
            return { content: [{ type: "text" as const, text: "委派失败: " + err.message }], details: {} };
          }
        },
      };

      const fullPrompt =
        basePrompt +
        "\n\n[系统信息] 当前模型: " + currentModelId +
        " | 当前时间: " + new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      agent = createAgent(
        { ...defaultAgent, systemPrompt: fullPrompt, modelId: currentModelId, thinking: currentThinking },
        [...allTools, delegateTool] as any, msgs ?? [],
        {
          accessMode: currentMode as any,
          onAsk: async (toolName, params) => {
            // 通过 WS 向 UI 请求权限确认
            return new Promise<boolean>((resolve) => {
              pendingPermission = { resolve };
              ws.send(JSON.stringify({
                type: "permission_request",
                toolName,
                params,
              }));
            });
          },
        }
      );

      agent.subscribe((event: any) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        switch (event.type) {
          case "message_update": {
            const m = event.assistantMessageEvent;
            if (m.type === "text_delta") ws.send(JSON.stringify({ type: "text_delta", delta: m.delta }));
            else if (m.type === "toolcall_start") {
              const tc = m.partial?.content?.[m.contentIndex];
              ws.send(JSON.stringify({ type: "tool_start", name: tc?.name ?? "?", input: tc?.input ?? {} }));
            } else if (m.type === "thinking_delta") {
              ws.send(JSON.stringify({ type: "thinking_delta", delta: m.delta }));
            }
            break;
          }
          case "tool_execution_end": ws.send(JSON.stringify({ type: "tool_end" })); break;
          case "agent_end":
            // 只有当前代际的 Agent 才保存
            if (thisGen !== agentGeneration) break;
            ws.send(JSON.stringify({ type: "done" }));
            // 估算本轮 token 增量
            const msgs = (event as any).messages;
            if (msgs) {
              const totalLen = JSON.stringify(msgs).length;
              const delta = Math.max(0, totalLen - prevMsgLen);
              prevMsgLen = totalLen;
              const estimated = Math.round(delta / 3);
              if (estimated > 0) {
                ws.send(JSON.stringify({ type: "token_usage", total: estimated }));
              }
            }
            if (agent) {
              // 首次对话后用 AI 生成标题
              if (!sessionTitle && firstMessage) {
                const replyText = agent.state.messages
                  .filter((m: any) => m.role === "assistant")
                  .flatMap((m: any) => Array.isArray(m.content) ? m.content.filter((c: any) => c.type === "text").map((c: any) => c.text) : [m.content])
                  .join(" ").slice(0, 200);
                generateTitle(firstMessage, replyText).then((t) => {
                  sessionTitle = t;
                  saveSession(sessionId, agent!.state.messages, sessionTitle, {
                    modelId: currentModelId, accessMode: currentMode, thinking: currentThinking, agentId: currentAgentId,
                  }).then(() => { memory.indexSession(sessionId, sessionTitle, agent!.state.messages, Date.now()); }).catch(() => {});
                });
              }
              saveSession(sessionId, agent.state.messages, sessionTitle || firstMessage || undefined, {
                modelId: currentModelId,
                accessMode: currentMode,
                thinking: currentThinking,
                agentId: currentAgentId,
              }).then(() => {
                // 建记忆索引
                memory.indexSession(
                  sessionId,
                  firstMessage || "未命名",
                  agent?.state.messages || [],
                  Date.now()
                );
              }).catch((err) => console.error("[Server] 保存失败:", err.message));
            }
            break;
        }
      });
    }

    function sendSessionMeta() {
      ws.send(JSON.stringify({ type: "mode", mode: currentMode }));
      ws.send(JSON.stringify({ type: "model", modelId: currentModelId }));
      ws.send(JSON.stringify({ type: "thinking", level: currentThinking }));
      ws.send(JSON.stringify({ type: "agent", agentId: currentAgentId }));
    }

    ws.on("message", async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "handshake") {
          if (msg.sessionId) {
            const saved = await loadSession(msg.sessionId);
            if (saved) {
              sessionId = msg.sessionId;
              currentModelId = saved.meta?.modelId || "deepseek-v4-pro";
              currentMode = saved.meta?.accessMode || "ask";
              currentThinking = saved.meta?.thinking || "off";
              currentAgentId = saved.meta?.agentId || "default";
              sessionTitle = saved.meta?.title || "";
              await initAgent(saved.messages);
              ws.send(JSON.stringify({ type: "history", messages: saved.messages }));
              sendSessionMeta();
              return;
            }
          }
          // 没有有效的 sessionId：延迟创建会话，等用户发第一条消息时再创建
          ws.send(JSON.stringify({ type: "session", sessionId: "" }));
          await initAgent([]);
          ws.send(JSON.stringify({ type: "history", messages: [] }));
          ws.send(JSON.stringify({ type: "mode", mode: "ask" }));
          ws.send(JSON.stringify({ type: "model", modelId: "deepseek-v4-pro" }));
          return;
        }

        if (msg.type === "prompt" && msg.content && agent) {
          if (!sessionId) {
            sessionId = generateSessionId();
            ws.send(JSON.stringify({ type: "session", sessionId }));
          }
          if (!firstMessage) firstMessage = msg.content;

          // 检索相关记忆，注入 System Prompt
          const memories = memory.search(msg.content, 3);
          if (memories.length > 0) {
            const memText = memories
              .map((m) => `[记忆: ${m.title}] ${m.text}`)
              .join("\n");
            const sys = agent.state.systemPrompt as string;
            agent.state.systemPrompt =
              sys +
              `\n\n[相关历史记忆]\n${memText}\n如果与当前问题相关，可以引用这些记忆。`;
            console.log(
              `[Memory] 注入 ${memories.length} 条相关记忆 (索引 ${memory.size} 条)`
            );
          }

          await agent.prompt(msg.content);
        }

        if (msg.type === "list_sessions") {
          ws.send(JSON.stringify({ type: "session_list", sessions: await listSessions() }));
        }

        if (msg.type === "rename_session" && msg.sessionId && msg.title) {
          await renameSession(msg.sessionId, msg.title);
          ws.send(JSON.stringify({ type: "session_list", sessions: await listSessions() }));
        }

        if (msg.type === "archive_session" && msg.sessionId) {
          await archiveSession(msg.sessionId, msg.archived !== false);
          ws.send(JSON.stringify({ type: "session_list", sessions: await listSessions() }));
        }

        if (msg.type === "switch_session") {
          // 先保存当前会话
          if (agent && sessionId && agent.state.messages && agent.state.messages.length > 0) {
            await saveSession(sessionId, agent.state.messages, firstMessage || undefined, {
              modelId: currentModelId, accessMode: currentMode, thinking: currentThinking, agentId: currentAgentId,
            }, false);
          }
          if (msg.sessionId) {
            const saved = await loadSession(msg.sessionId);
            sessionId = msg.sessionId;
            firstMessage = "";
            sessionTitle = "";
            currentModelId = saved?.meta?.modelId || "deepseek-v4-pro";
            currentMode = saved?.meta?.accessMode || "ask";
            currentThinking = saved?.meta?.thinking || "off";
            currentAgentId = saved?.meta?.agentId || "default";
            await initAgent(saved?.messages ?? []);
            ws.send(JSON.stringify({ type: "session", sessionId }));
            ws.send(JSON.stringify({ type: "history", messages: saved?.messages ?? [] }));
          } else {
            sessionId = generateSessionId();
            firstMessage = "";
            sessionTitle = "";
            currentModelId = "deepseek-v4-pro";
            currentMode = "ask";
            currentThinking = "off";
            await initAgent([]);
            ws.send(JSON.stringify({ type: "session", sessionId }));
            ws.send(JSON.stringify({ type: "history", messages: [] }));
          }
          sendSessionMeta();
          ws.send(JSON.stringify({ type: "session_list", sessions: await listSessions() }));
        }

        if (msg.type === "get_config") {
          ws.send(JSON.stringify({ type: "config", config: await loadSettings() }));
        }

        if (msg.type === "set_config" && msg.config) {
          await saveSettings(msg.config);
          ws.send(JSON.stringify({ type: "config_saved" }));
        }

        if (msg.type === "set_mode" && msg.mode) {
          currentMode = msg.mode;
          if (agent) {
            await initAgent(agent.state.messages);
            saveSession(sessionId, agent.state.messages, firstMessage || undefined, {
              modelId: currentModelId, accessMode: currentMode, thinking: currentThinking, agentId: currentAgentId,
            }, false).catch(() => {});
          }
          ws.send(JSON.stringify({ type: "mode", mode: currentMode }));
        }

        if (msg.type === "set_model" && msg.modelId) {
          console.log(`[Server] 切换模型: ${currentModelId} → ${msg.modelId}`);
          currentModelId = msg.modelId;
          if (agent) {
            await initAgent(agent.state.messages);
            saveSession(sessionId, agent.state.messages, firstMessage || undefined, {
              modelId: currentModelId, accessMode: currentMode, thinking: currentThinking, agentId: currentAgentId,
            }, false).catch(() => {});
          }
          ws.send(JSON.stringify({ type: "model", modelId: currentModelId }));
        }

        if (msg.type === "set_thinking" && msg.level !== undefined) {
          currentThinking = msg.level;
          if (agent) {
            await initAgent(agent.state.messages);
            saveSession(sessionId, agent.state.messages, firstMessage || undefined, {
              modelId: currentModelId, accessMode: currentMode, thinking: currentThinking, agentId: currentAgentId,
            }, false).catch(() => {});
          }
          ws.send(JSON.stringify({ type: "thinking", level: currentThinking }));
        }

        // Agent 列表 + CRUD
        if (msg.type === "list_agents") {
          const settings = await loadSettings();
          ws.send(JSON.stringify({ type: "agent_list", agents: settings.agents || [] }));
        }

        if (msg.type === "add_agent" && msg.agent) {
          const settings = await loadSettings();
          const agents = [...(settings.agents || [])];
          const newAgent = { id: msg.agent.id || "agent_" + Date.now(), ...msg.agent };
          agents.push(newAgent);
          await saveSettings({ agents } as any);
          ws.send(JSON.stringify({ type: "agent_list", agents }));
        }

        if (msg.type === "update_agent" && msg.agent) {
          const settings = await loadSettings();
          const agents = (settings.agents || []).map((a: any) =>
            a.id === msg.agent.id ? { ...a, ...msg.agent } : a
          );
          await saveSettings({ agents } as any);
          ws.send(JSON.stringify({ type: "agent_list", agents }));
        }

        if (msg.type === "delete_agent" && msg.agentId) {
          const settings = await loadSettings();
          const agents = (settings.agents || []).filter((a: any) => a.id !== msg.agentId);
          await saveSettings({ agents } as any);
          ws.send(JSON.stringify({ type: "agent_list", agents }));
        }

        // ── 技能管理 ──
        if (msg.type === "list_skills") {
          const settings = await loadSettings();
          // 扫描 skills/ 目录获取实际已安装的技能
          const skillsDir = path.resolve(process.cwd(), "skills");
          const installed: string[] = [];
          try {
            const entries = await fs.readdir(skillsDir, { withFileTypes: true });
            for (const e of entries) {
              if (e.isDirectory()) installed.push(e.name);
              else if (e.isFile() && e.name.endsWith(".md")) installed.push(e.name.replace(/\.md$/, ""));
            }
          } catch {}
          // 合并：已安装的 + 配置中的
          const existingSkills = settings.skills || [];
          const merged = existingSkills.filter((s) => installed.includes(s.id) || s.source !== "local");
          for (const name of installed) {
            if (!merged.find((s) => s.id === name)) {
              merged.push({ id: name, name, description: "", source: "local", enabled: true, installedAt: Date.now() });
            }
          }
          await saveSettings({ skills: merged } as any);
          ws.send(JSON.stringify({ type: "skill_list", skills: merged, agentSkills: settings.agentSkills || {} }));
        }

        if (msg.type === "install_skill" && msg.skill) {
          const settings = await loadSettings();
          const skills = [...(settings.skills || [])];
          const skill = { id: msg.skill.id || "skill_" + Date.now(), name: msg.skill.name, description: msg.skill.description || "", source: msg.skill.source || "local", enabled: true, installedAt: Date.now() };
          // 去重
          const idx = skills.findIndex((s) => s.id === skill.id);
          if (idx >= 0) skills[idx] = skill; else skills.push(skill);
          // 创建 skills 目录和 SKILL.md
          const skillDir = path.resolve(process.cwd(), "skills", skill.id);
          await fs.mkdir(skillDir, { recursive: true });
          const content = `# ${skill.name}\n\n${skill.description}\n`;
          await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");
          await saveSettings({ skills } as any);
          ws.send(JSON.stringify({ type: "skill_list", skills, agentSkills: settings.agentSkills || {} }));
        }

        if (msg.type === "remove_skill" && msg.skillId) {
          const settings = await loadSettings();
          const skills = (settings.skills || []).filter((s) => s.id !== msg.skillId);
          // 删除 skills 目录
          const skillDir = path.resolve(process.cwd(), "skills", msg.skillId);
          try { await fs.rm(skillDir, { recursive: true, force: true }); } catch {}
          await saveSettings({ skills } as any);
          ws.send(JSON.stringify({ type: "skill_list", skills, agentSkills: settings.agentSkills || {} }));
        }

        if (msg.type === "toggle_skill" && msg.skillId && msg.agentId !== undefined) {
          const settings = await loadSettings();
          const agentSkills = { ...(settings.agentSkills || {}) };
          const list = new Set(agentSkills[msg.agentId] || []);
          if (msg.enabled) list.add(msg.skillId); else list.delete(msg.skillId);
          agentSkills[msg.agentId] = Array.from(list);
          await saveSettings({ agentSkills } as any);
          ws.send(JSON.stringify({ type: "skill_list", skills: settings.skills || [], agentSkills }));
        }

        // 文件列表（书桌）
        if (msg.type === "list_files") {
          const dirPath = msg.path || ".";
          try {
            const fullPath = path.resolve(process.cwd(), dirPath);
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            const files = entries
              .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "sessions")
              .map((e) => ({
                name: e.name,
                isDir: e.isDirectory(),
                path: path.relative(process.cwd(), path.join(fullPath, e.name)).replace(/\\/g, "/"),
              }));
            files.sort((a, b) => {
              if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
            ws.send(JSON.stringify({ type: "file_list", files, currentPath: dirPath }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "file_list", files: [], error: err.message }));
          }
        }

        // 切换 Agent
        if (msg.type === "switch_agent" && msg.agentId) {
          currentAgentId = msg.agentId;
          // 用新 Agent 的默认模型和模式
          const settings = await loadSettings();
          const profile = settings.agents?.find((a) => a.id === currentAgentId);
          if (profile?.defaultModel) currentModelId = profile.defaultModel;
          if (profile?.defaultMode) currentMode = profile.defaultMode;
          if (agent) {
            await initAgent(agent.state.messages);
            saveSession(sessionId, agent.state.messages, firstMessage || undefined, {
              modelId: currentModelId, accessMode: currentMode, thinking: currentThinking, agentId: currentAgentId,
            }, false).catch(() => {});
          }
          sendSessionMeta();
          ws.send(JSON.stringify({ type: "agent", agentId: currentAgentId }));
        }

        // 权限确认响应
        if (msg.type === "permission_response") {
          if (pendingPermission) {
            pendingPermission.resolve(msg.allowed === true);
            pendingPermission = null;
          }
        }

        // ── 多 Agent 编排 ──
        if (msg.type === "orchestrate" && msg.content) {
          const settings = await loadSettings();
          try {
            // AgentFactory: 用现有的 createAgent 做执行
            const agentFactory: AgentFactory = {
              async createAndRun(systemPrompt, userPrompt, modelId, onDelta) {
                let result = "";
                const sub = createAgent(
                  { ...defaultAgent, systemPrompt, modelId: modelId || "deepseek-v4-pro" },
                  [...customTools, ...extTools], [],
                  { accessMode: "auto" as any }
                );
                sub.subscribe((event: any) => {
                  if (event.type === "message_update") {
                    const m = event.assistantMessageEvent;
                    if (m.type === "text_delta") {
                      result += m.delta;
                      onDelta?.(m.delta);
                    }
                  }
                });
                await sub.prompt(userPrompt);
                return result;
              },
            };

            // FileService
            const fileService: FileService = {
              async readFile(p) { return fs.readFile(p, "utf-8"); },
              async writeFile(p, c) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, c, "utf-8"); },
              async listDir(p) {
                const entries = await fs.readdir(p, { withFileTypes: true });
                return entries.map((e) => ({ name: e.name, isDir: e.isDirectory(), path: path.relative(process.cwd(), path.join(p, e.name)).replace(/\\/g, "/") }));
              },
            };

            // 运行编排器
            const result = await runOrchestrator(msg.content, {
              agentFactory,
              fileService,
              projectRoot: process.cwd(),
              rules: [],
              customStyles: msg.styles,
              onEvent: (event) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "orchestrator_event", ...event }));
                }
              },
            });

            ws.send(JSON.stringify({ type: "orchestrate_done", answer: result.answer }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "error", message: "编排失败: " + err.message }));
          }
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", message: err.message || String(err) }));
      }
    });

    ws.on("close", () => console.log("[Server] 断开"));
  });

  httpServer.listen(port);
  console.log(`[Server] ws://localhost:${port}`);

  return { stop: () => { wss.close(); httpServer.close(); } };
}
