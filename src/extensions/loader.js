/**
 * 扩展加载器
 *
 * 扫描 extensions/ 目录，动态加载所有 .ts 扩展文件。
 * 每个扩展文件导出：
 *   name: string           扩展名称
 *   tools?: AgentTool[]    注册的自定义工具
 *   commands?: { name, description, handler }[]  注册的斜杠命令
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
const EXTENSIONS_DIR = path.resolve(process.cwd(), "extensions");
/** 扫描并加载所有扩展 */
export async function loadExtensions() {
    const extensions = [];
    // 确保目录存在
    try {
        await fs.access(EXTENSIONS_DIR);
    }
    catch {
        await fs.mkdir(EXTENSIONS_DIR, { recursive: true });
        return extensions; // 空目录
    }
    const entries = await fs.readdir(EXTENSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
        // 支持 .ts 文件 和 子目录/index.ts
        let filePath;
        if (entry.isFile() && entry.name.endsWith(".ts")) {
            filePath = path.join(EXTENSIONS_DIR, entry.name);
        }
        else if (entry.isDirectory()) {
            const idxPath = path.join(EXTENSIONS_DIR, entry.name, "index.ts");
            try {
                await fs.access(idxPath);
                filePath = idxPath;
            }
            catch {
                continue;
            }
        }
        else {
            continue;
        }
        try {
            // 动态 import .ts 文件（Windows 需要用 file:// URL）
            const fileUrl = pathToFileURL(filePath).href;
            const mod = await import(fileUrl);
            const ext = {
                name: mod.name || entry.name.replace(/\.ts$/, ""),
                tools: mod.tools || [],
                commands: mod.commands || [],
            };
            extensions.push(ext);
            console.log("  📦 扩展已加载: " + ext.name + " (" + ext.tools.length + " 工具, " + ext.commands.length + " 命令)");
        }
        catch (err) {
            console.error("  ⚠ 加载扩展失败: " + entry.name + " - " + (err.message || err));
        }
    }
    return extensions;
}
/** 从扩展列表中提取所有工具 */
export function collectTools(extensions) {
    return extensions.flatMap((ext) => ext.tools);
}
/** 从扩展列表中提取所有命令 */
export function collectCommands(extensions) {
    return extensions.flatMap((ext) => ext.commands);
}
//# sourceMappingURL=loader.js.map