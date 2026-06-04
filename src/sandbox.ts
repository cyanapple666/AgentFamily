/**
 * 沙盒系统
 *
 * 安全控制：
 * - 沙盒内的文件：可读可写
 * - 沙盒外的文件：只可读
 * - bash 命令中的写操作：检查目标路径
 */

import * as path from "node:path";

export interface SandboxConfig {
  /** 是否启用沙盒 */
  enabled: boolean;
  /** 沙盒文件夹路径（绝对路径） */
  sandboxPath: string;
}

/** 默认配置：不启用沙盒 */
export const DEFAULT_SANDBOX: SandboxConfig = {
  enabled: false,
  sandboxPath: "",
};

/**
 * 检查路径是否在沙盒内
 */
export function isInSandbox(targetPath: string, sandbox: SandboxConfig): boolean {
  if (!sandbox.enabled || !sandbox.sandboxPath) return true;
  
  const resolved = path.resolve(targetPath);
  const sandboxResolved = path.resolve(sandbox.sandboxPath);
  
  return resolved.startsWith(sandboxResolved + path.sep) || resolved === sandboxResolved;
}

/**
 * 检查写操作是否被允许
 * 返回 null 表示允许，返回字符串表示拒绝原因
 */
export function checkWritePermission(targetPath: string, sandbox: SandboxConfig): string | null {
  if (!sandbox.enabled) return null;
  
  if (!isInSandbox(targetPath, sandbox)) {
    const shortPath = targetPath.length > 50 ? "..." + targetPath.slice(-47) : targetPath;
    return `写操作被沙盒阻止: ${shortPath} 不在沙盒目录内。沙盒目录: ${sandbox.sandboxPath}`;
  }
  
  return null;
}

/**
 * 从 bash 命令中提取可能的写目标路径
 * 识别常见的写操作命令：echo >, cat >, cp, mv, mkdir, rm, touch, tee, sed -i
 */
export function extractWriteTargets(command: string): string[] {
  const targets: string[] = [];
  
  // 重定向: > 或 >>
  const redirectMatch = command.match(/(?:^|\s)(?:>>?)\s*([^\s;&|]+)/g);
  if (redirectMatch) {
    for (const m of redirectMatch) {
      const file = m.replace(/^>>?\s*/, "").trim();
      if (file && !file.startsWith("-")) {
        targets.push(file);
      }
    }
  }
  
  // cp, mv 目标
  const cpMvMatch = command.match(/(?:cp|mv)\s+(?:-[^\s]*\s+)*[^\s]+\s+([^\s]+)/);
  if (cpMvMatch) targets.push(cpMvMatch[1]);
  
  // mkdir
  const mkdirMatch = command.match(/mkdir\s+(?:-[^\s]*\s+)*([^\s]+)/);
  if (mkdirMatch) targets.push(mkdirMatch[1]);
  
  // rm
  const rmMatch = command.match(/rm\s+(?:-[^\s]*\s+)*([^\s]+)/);
  if (rmMatch) targets.push(rmMatch[1]);
  
  // touch
  const touchMatch = command.match(/touch\s+([^\s]+)/);
  if (touchMatch) targets.push(touchMatch[1]);
  
  // tee
  const teeMatch = command.match(/tee\s+(?:-[^\s]*\s+)*([^\s]+)/);
  if (teeMatch) targets.push(teeMatch[1]);
  
  // sed -i
  const sedMatch = command.match(/sed\s+-[^\s]*i[^\s]*\s+['"][^'"]+['"]\s+([^\s]+)/);
  if (sedMatch) targets.push(sedMatch[1]);
  
  return targets;
}

/**
 * 检查 bash 命令中的写操作是否被允许
 * 返回 null 表示允许，返回字符串表示拒绝原因
 */
export function checkBashWritePermission(command: string, sandbox: SandboxConfig): string | null {
  if (!sandbox.enabled) return null;
  
  const writeTargets = extractWriteTargets(command);
  
  for (const target of writeTargets) {
    // 如果是相对路径，相对于沙盒目录解析
    // 如果是绝对路径，直接使用
    const fullPath = path.isAbsolute(target) 
      ? target 
      : path.resolve(sandbox.sandboxPath, target);
    
    const error = checkWritePermission(fullPath, sandbox);
    if (error) return error;
  }
  
  return null;
}
