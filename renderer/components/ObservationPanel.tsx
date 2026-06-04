/**
 * 观察窗口 — 实时展示 SubAgent 编排进度
 */
import { useState, useEffect, useRef } from "react";
import { BotIcon, ChevronDownIcon, ClockIcon, CheckIcon } from "./Icons";

export interface TaskStatus {
  id: string;
  title: string;
  type: string;
  status: "pending" | "running" | "done" | "failed";
  startTime?: number;
  endTime?: number;
  reasoning?: string;
  filesWritten?: string[];
}

export interface OrchestratorState {
  phase: "idle" | "decomposing" | "executing" | "reviewing" | "done";
  summary: string;
  reasoning: string;
  tasks: TaskStatus[];
  currentTaskId?: string;
  startedAt?: number;
  approved?: boolean;
  reviewSummary?: string;
}

interface Props {
  state: OrchestratorState;
  visible: boolean;
  onToggle: () => void;
}

/** 阶段标签 */
function PhaseBadge({ phase }: { phase: OrchestratorState["phase"] }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    idle: { label: "空闲", color: "var(--text3)", bg: "var(--bg4)" },
    decomposing: { label: "分解中", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    executing: { label: "执行中", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
    reviewing: { label: "验收中", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
    done: { label: "完成", color: "var(--success)", bg: "rgba(52,211,153,0.12)" },
  };
  const c = config[phase] || config.idle;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

/** 任务类型色块 */
function TypeDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    frontend: "#f7df1e", backend: "#34d399", ui: "#f87171",
    test: "#60a5fa", docs: "#a78bfa", config: "#94a3b8",
  };
  return (
    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: colors[type] || "var(--text3)", flexShrink: 0 }} />
  );
}

/** 任务状态图标 */
function TaskStatusIcon({ status }: { status: TaskStatus["status"] }) {
  if (status === "done") return <CheckIcon size={12} color="var(--success)" />;
  if (status === "failed") return <span style={{ fontSize: 11, color: "var(--danger)" }}>✕</span>;
  if (status === "running") return <span className="obs-spinner" style={{ width: 10, height: 10 }} />;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--text3)", opacity: 0.4 }} />;
}

/** 耗时格式化 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default function ObservationPanel({ state, visible, onToggle }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // 自动滚动到最新任务
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [state.tasks.length, state.currentTaskId]);

  const elapsed = state.startedAt ? formatDuration(Date.now() - state.startedAt) : "";
  const doneCount = state.tasks.filter((t) => t.status === "done").length;
  const failedCount = state.tasks.filter((t) => t.status === "failed").length;
  const runningCount = state.tasks.filter((t) => t.status === "running").length;
  const hasActivity = state.phase !== "idle";

  return (
    <div style={styles.container}>
      {/* 折叠标题栏 */}
      <button style={styles.header} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BotIcon size={14} color={hasActivity ? "var(--accent)" : "var(--text3)"} />
          <span style={{ fontSize: 11, fontWeight: 600, color: hasActivity ? "var(--text)" : "var(--text3)" }}>
            编排观察
          </span>
          <PhaseBadge phase={state.phase} />
          {hasActivity && state.tasks.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "monospace" }}>
              {doneCount}/{state.tasks.length}
              {failedCount > 0 && <span style={{ color: "var(--danger)" }}> · {failedCount}失败</span>}
              {runningCount > 0 && <span style={{ color: "#6366f1" }}> · {runningCount}执行中</span>}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {elapsed && <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "monospace" }}>{elapsed}</span>}
          <ChevronDownIcon
            size={12}
            color="var(--text3)"
            style={{ transition: "transform 0.2s", transform: visible ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </div>
      </button>

      {/* 展开内容 */}
      {visible && (
        <div style={styles.body} className="fade-in">
          {/* 摘要 */}
          {state.summary && (
            <div style={styles.summary}>
              <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600, marginRight: 6 }}>目标</span>
              <span style={{ fontSize: 11, color: "var(--text2)" }}>{state.summary}</span>
            </div>
          )}

          {/* 任务列表 */}
          {state.tasks.length > 0 ? (
            <div ref={listRef} style={styles.taskList}>
              {state.tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    ...styles.taskItem,
                    background: task.status === "running" ? "rgba(99,102,241,0.06)" : "transparent",
                    borderLeft: task.status === "running" ? "2px solid #6366f1" : "2px solid transparent",
                  }}
                  onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                >
                  <div style={styles.taskRow}>
                    <TaskStatusIcon status={task.status} />
                    <TypeDot type={task.type} />
                    <span style={{ fontSize: 11, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.title || task.id}
                    </span>
                    <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "monospace" }}>{task.type}</span>
                    {task.startTime && task.endTime && (
                      <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "monospace" }}>
                        {formatDuration(task.endTime - task.startTime)}
                      </span>
                    )}
                    {task.status === "running" && task.startTime && (
                      <span style={{ fontSize: 9, color: "#6366f1", fontFamily: "monospace" }}>
                        {formatDuration(Date.now() - task.startTime)}
                      </span>
                    )}
                  </div>

                  {/* 展开详情 */}
                  {expandedTask === task.id && (task.reasoning || task.filesWritten?.length) && (
                    <div style={styles.taskDetail} className="fade-in">
                      {task.reasoning && (
                        <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.6, marginTop: 6 }}>
                          {task.reasoning}
                        </div>
                      )}
                      {task.filesWritten && task.filesWritten.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {task.filesWritten.map((f) => (
                            <span key={f} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg4)", color: "var(--text3)", fontFamily: "monospace" }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : state.phase === "idle" ? (
            <div style={styles.empty}>
              <span style={{ fontSize: 11, color: "var(--text3)", opacity: 0.5 }}>
                输入 /orchestrate + 需求 来启动编排
              </span>
            </div>
          ) : (
            <div style={styles.empty}>
              <span style={{ fontSize: 11, color: "var(--text3)", opacity: 0.5 }}>
                等待任务分解...
              </span>
            </div>
          )}

          {/* 验收结果 */}
          {state.phase === "done" && state.approved !== undefined && (
            <div style={styles.reviewBar}>
              <span style={{ fontSize: 10, color: state.approved ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                {state.approved ? "✓ 验收通过" : "✕ 需要修复"}
              </span>
              {state.reviewSummary && (
                <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 8 }}>{state.reviewSummary}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* spinner 动画 */}
      <style>{`
        .obs-spinner {
          border: 1.5px solid var(--border2);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg2)",
    flexShrink: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 14px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    width: "100%",
    transition: "background 0.15s",
  },
  body: {
    maxHeight: 200,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--border)",
  },
  summary: {
    padding: "6px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
  },
  taskList: {
    flex: 1,
    overflowY: "auto",
    maxHeight: 160,
  },
  taskItem: {
    padding: "5px 14px",
    cursor: "pointer",
    transition: "background 0.1s",
    borderBottom: "1px solid var(--border)",
  },
  taskRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  taskDetail: {
    paddingLeft: 22,
    paddingBottom: 4,
  },
  empty: {
    padding: "16px 14px",
    textAlign: "center",
  },
  reviewBar: {
    padding: "6px 14px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
  },
};
