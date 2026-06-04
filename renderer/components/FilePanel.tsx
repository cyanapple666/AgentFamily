/**
 * 文件面板 — 浏览和选择文件
 */
import { FolderIcon, FileIcon, ArrowLeftIcon, CloseIcon } from "./Icons";

interface FileEntry { name: string; isDir: boolean; path: string; }

interface Props {
  files: FileEntry[];
  currentPath: string;
  onNavigate: (dir: string) => void;
  onFileClick: (filePath: string) => void;
  onClose: () => void;
}

/** 根据文件扩展名返回不同颜色 */
function getFileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["js", "ts", "tsx", "jsx"].includes(ext)) return "#f7df1e";
  if (["py"].includes(ext)) return "#3776ab";
  if (["json", "yaml", "yml", "toml"].includes(ext)) return "#34d399";
  if (["md", "txt", "log"].includes(ext)) return "var(--text3)";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "#f59e0b";
  if (["html", "css", "scss"].includes(ext)) return "#f87171";
  if (["go", "rs"].includes(ext)) return "var(--accent)";
  return "var(--text3)";
}

export default function FilePanel({ files, currentPath, onNavigate, onFileClick, onClose }: Props) {
  return (
    <div style={styles.panel} className="slide-in">
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FolderIcon size={14} color="var(--accent)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>文件</span>
        </div>
        <button className="icon-btn" onClick={onClose} style={{ width: 24, height: 24 }}>
          <CloseIcon size={12} />
        </button>
      </div>

      {/* 路径 */}
      <div style={styles.pathBar}>
        <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "monospace" }}>{currentPath}</span>
      </div>

      {/* 返回上级 */}
      {currentPath !== "." && (
        <button
          style={styles.backBtn}
          onClick={() => {
            const parent = currentPath.split("/").slice(0, -1).join("/") || ".";
            onNavigate(parent);
          }}
        >
          <ArrowLeftIcon size={12} />
          <span>返回上级</span>
        </button>
      )}

      {/* 文件列表 */}
      <div style={styles.list}>
        {files.map((f) => (
          <div
            key={f.path}
            style={styles.item}
            className="file-item"
            onClick={() => f.isDir ? onNavigate(f.path) : onFileClick(f.path)}
            draggable={!f.isDir}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", f.path)}
          >
            {f.isDir ? (
              <FolderIcon size={14} color="var(--accent)" />
            ) : (
              <FileIcon size={14} color={getFileColor(f.name)} />
            )}
            <span style={styles.name}>{f.name}</span>
          </div>
        ))}
        {files.length === 0 && (
          <div style={{ padding: "20px 12px", fontSize: 12, color: "var(--text3)", textAlign: "center", opacity: 0.4 }}>
            空目录
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 240,
    display: "flex",
    flexDirection: "column",
    borderLeft: "1px solid var(--border)",
    background: "var(--bg2)",
    overflow: "hidden",
    userSelect: "none",
    color: "var(--text)",
    paddingTop: 38,
  },
  header: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pathBar: {
    padding: "6px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg3)",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    fontSize: 12,
    cursor: "pointer",
    color: "var(--text2)",
    border: "none",
    background: "transparent",
    borderBottom: "1px solid var(--border)",
    transition: "all var(--transition)",
    width: "100%",
    textAlign: "left",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 8px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontSize: 12,
    transition: "all var(--transition)",
  },
  name: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "var(--text2)",
  },
};

// hover 样式
const fileStyleTag = document.createElement("style");
fileStyleTag.textContent = `
  .file-item:hover { background: var(--bg4) !important; }
  .file-item:hover span { color: var(--text) !important; }
`;
if (typeof document !== "undefined" && !document.getElementById("file-styles")) {
  fileStyleTag.id = "file-styles";
  document.head.appendChild(fileStyleTag);
}
