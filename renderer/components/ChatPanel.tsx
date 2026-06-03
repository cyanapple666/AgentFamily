/**
 * 聊天面板：消息列表 + 代码高亮 + 操作按钮
 */
import { useEffect, useRef, useState } from "react";
import type { DisplayMessage } from "../types";
import { useT } from "../i18n";
import { CopyIcon, RefreshIcon, CheckIcon, BrainIcon, ChevronDownIcon } from "./Icons";

interface Props {
  messages: DisplayMessage[];
  isStreaming: boolean;
  onRetry?: (content: string) => void;
}

/** 简单 Markdown 渲染 */
function renderContent(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_: string, lang: string, code: string) => {
      return `<pre class="code-block"><code class="language-${lang || ""}">${code}</code></pre>`;
    }
  );
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin: 12px 0 6px; font-size: 15px; font-weight: 600;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin: 14px 0 8px; font-size: 16px; font-weight: 700;">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin: 16px 0 8px; font-size: 18px; font-weight: 700;">$1</h2>');
  html = html.replace(/\n/g, "<br/>");
  return html;
}

export default function ChatPanel({ messages, isStreaming, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const copyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 正在流式输出的消息自动展开思考
  useEffect(() => {
    const streaming = messages.find((m) => m.isStreaming && m.thinking);
    if (streaming && !expandedThinking.has(streaming.id)) {
      setExpandedThinking((prev) => new Set([...prev, streaming.id]));
    }
  }, [messages]);

  return (
    <div style={styles.panel}>
      {/* 空状态 */}
      {messages.length === 0 && (
        <div style={styles.empty} className="fade-in">
          <div style={styles.emptyIcon}>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <rect width="56" height="56" rx="16" fill="var(--accent-soft)" />
              <path d="M18 36L28 20L38 36" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="28" cy="23" r="3" fill="var(--accent)" />
              <line x1="22" y1="32" x2="34" y2="32" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", opacity: 0.8, marginTop: 8 }}>agentFamily</p>
          <p style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>开始一段对话吧</p>
        </div>
      )}

      {/* 消息列表 */}
      {messages.map((msg) => {
        if (!msg.content && (!msg.toolCalls || msg.toolCalls.length === 0)) return null;
        const isUser = msg.role === "user";

        return (
          <div key={msg.id} style={styles.msgRow(msg.role)} className="fade-in">
            {/* 头像 */}
            {!isUser && (
              <div style={styles.avatar}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="10" rx="2" stroke="var(--accent)" strokeWidth="1.5" />
                  <circle cx="12" cy="5" r="2" stroke="var(--accent)" strokeWidth="1.5" />
                  <line x1="12" y1="7" x2="12" y2="11" stroke="var(--accent)" strokeWidth="1.5" />
                  <circle cx="9" cy="16" r="1" fill="var(--accent)" />
                  <circle cx="15" cy="16" r="1" fill="var(--accent)" />
                </svg>
              </div>
            )}

            <div style={{ maxWidth: "80%", minWidth: 0 }}>
              <div style={styles.bubble(msg.role)}>
                {/* 工具调用卡片 */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={styles.toolCalls}>
                    {msg.toolCalls.map((tc) => (
                      <div key={tc.id} style={styles.toolCard}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: tc.status === "running" ? "var(--warning)" : "var(--success)",
                          flexShrink: 0,
                          animation: tc.status === "running" ? "dotPulse 1.4s infinite" : "none",
                        }} />
                        <span style={{ fontWeight: 600, color: "var(--accent)", fontSize: 12 }}>
                          {tc.name}
                        </span>
                        <span style={{ opacity: 0.4, fontFamily: "monospace", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                          {JSON.stringify(tc.input).slice(0, 40)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 思考过程 */}
                {msg.thinking && (
                  <div style={styles.thinkingSection}>
                    <div
                      style={styles.thinkingToggle}
                      onClick={() => toggleThinking(msg.id)}
                    >
                      <BrainIcon size={13} color="var(--text3)" style={{ marginRight: 5, flexShrink: 0 }} />
                      <span>思考过程</span>
                      <ChevronDownIcon
                        size={12}
                        color="var(--text3)"
                        style={{
                          marginLeft: 4,
                          transition: "transform var(--transition)",
                          transform: expandedThinking.has(msg.id) ? "rotate(0deg)" : "rotate(-90deg)",
                        }}
                      />
                      {msg.isStreaming && !msg.content && <span className="cursor-blink" style={{ marginLeft: 6 }}>▌</span>}
                    </div>
                    {expandedThinking.has(msg.id) && (
                      <div style={styles.thinkingContent}>
                        {msg.thinking}
                        {msg.isStreaming && !msg.content && <span className="cursor-blink">▌</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* 文字内容 */}
                {msg.content && (
                  <div
                    style={styles.content}
                    dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                  />
                )}

                {/* 流式光标 */}
                {msg.isStreaming && !msg.content && (
                  <span className="cursor-blink">▌</span>
                )}
              </div>

              {/* 时间戳 */}
              {!isUser && msg.content && (
                <div style={styles.timestamp}>
                  {new Date(msg.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            {!isUser && !msg.isStreaming && msg.content && (
              <div style={styles.actions}>
                <button
                  style={{ ...styles.actionBtn, ...(copiedId === msg.id ? { color: "var(--success)" } : {}) }}
                  onClick={() => copyMessage(msg.content, msg.id)}
                  title="复制"
                >
                  {copiedId === msg.id ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                </button>
                {onRetry && (
                  <button style={styles.actionBtn} onClick={() => onRetry(msg.content)} title="重试">
                    <RefreshIcon size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 加载动画 */}
      {isStreaming && (
        <div style={styles.msgRow("assistant")} className="fade-in">
          <div style={styles.avatar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="10" rx="2" stroke="var(--accent)" strokeWidth="1.5" />
              <circle cx="12" cy="5" r="2" stroke="var(--accent)" strokeWidth="1.5" />
              <line x1="12" y1="7" x2="12" y2="11" stroke="var(--accent)" strokeWidth="1.5" />
              <circle cx="9" cy="16" r="1" fill="var(--accent)" />
              <circle cx="15" cy="16" r="1" fill="var(--accent)" />
            </svg>
          </div>
          <div style={{ ...styles.bubble("assistant"), padding: "12px 18px" }}>
            <span className="dot">●</span>
            <span className="dot">●</span>
            <span className="dot">●</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

const styles: Record<string, any> = {
  panel: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  emptyIcon: {
    marginBottom: 4,
  },
  msgRow: (role: string) => ({
    display: "flex",
    flexDirection: role === "user" ? "row-reverse" : "row",
    alignItems: "flex-start",
    gap: 10,
  }),
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "var(--radius-sm)",
    background: "var(--accent-soft)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: (role: string): React.CSSProperties => ({
    padding: "12px 16px",
    borderRadius: role === "user"
      ? "var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)"
      : "var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",
    background: role === "user" ? "var(--user-bg)" : "var(--bg4)",
    color: role === "user" ? "var(--user-text)" : "var(--text)",
    fontSize: 13.5,
    lineHeight: 1.7,
    wordBreak: "break-word",
    boxShadow: role === "user" ? "var(--shadow-accent)" : "var(--shadow-sm)",
  }),
  content: {} as React.CSSProperties,
  timestamp: {
    fontSize: 10,
    opacity: 0.3,
    marginTop: 4,
    paddingLeft: 2,
  },
  thinkingSection: {
    marginBottom: 8,
    fontSize: 12,
  } as React.CSSProperties,
  thinkingToggle: {
    cursor: "pointer",
    userSelect: "none",
    padding: "3px 0",
    display: "flex",
    alignItems: "center",
    color: "var(--text3)",
    fontSize: 11,
    fontWeight: 500,
  } as React.CSSProperties,
  thinkingContent: {
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(0,0,0,0.2)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.5,
    maxHeight: 200,
    overflowY: "auto",
    fontSize: 12,
    color: "var(--text2)",
  } as React.CSSProperties,
  toolCalls: {
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } as React.CSSProperties,
  toolCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 10px",
    borderRadius: "var(--radius-sm)",
    background: "rgba(0,0,0,0.12)",
    fontSize: 12,
  } as React.CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "row",
    gap: 2,
    opacity: 0,
    transition: "opacity var(--transition)",
    alignSelf: "flex-start",
    marginTop: 4,
  } as React.CSSProperties,
  actionBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 4,
    color: "var(--text3)",
    transition: "all var(--transition)",
  } as React.CSSProperties,
};

// hover 显示操作按钮
const chatStyleTag = document.createElement("style");
chatStyleTag.textContent = `
  .chat-msg-row:hover > div:last-child { opacity: 1 !important; }
  .chat-action-btn:hover { background: var(--accent-soft) !important; color: var(--text) !important; }
`;
if (typeof document !== "undefined" && !document.getElementById("chat-styles")) {
  chatStyleTag.id = "chat-styles";
  document.head.appendChild(chatStyleTag);
}
