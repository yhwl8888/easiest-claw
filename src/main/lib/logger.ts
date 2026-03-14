/**
 * logger.ts — 主进程文件日志
 *
 * 日志文件位置：
 *   Windows: %APPDATA%\EasiestClaw\logs\main.log
 *   macOS:   ~/Library/Logs/EasiestClaw/main.log
 *
 * 超过 2MB 时自动轮转：main.log → main.log.old
 */

import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const MAX_BYTES = 2 * 1024 * 1024  // 2 MB

let logPath: string | null = null

function getLogPath(): string {
  if (!logPath) {
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    logPath = path.join(dir, 'main.log')
  }
  return logPath
}

function rotateIfNeeded(filePath: string): void {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_BYTES) {
      fs.renameSync(filePath, filePath + '.old')
    }
  } catch {
    // 文件不存在则不需要轮转
  }
}

function write(level: string, msg: string): void {
  const now = new Date()
  const ts = now.toISOString().replace('T', ' ').slice(0, 23)
  const line = `[${ts}] [${level}] ${msg}\n`

  // 同步写入，确保崩溃前日志已落盘
  try {
    const filePath = getLogPath()
    rotateIfNeeded(filePath)
    fs.appendFileSync(filePath, line, 'utf8')
  } catch {
    // 日志写入失败不应影响主流程
  }

  // 开发模式同时输出到控制台
  if (level === 'ERROR') {
    console.error(line.trimEnd())
  } else {
    console.log(line.trimEnd())
  }
}

export const logger = {
  info:  (msg: string) => write('INFO ', msg),
  warn:  (msg: string) => write('WARN ', msg),
  error: (msg: string) => write('ERROR', msg),
  /** 返回当前日志文件路径（用于 IPC 暴露给用户） */
  getPath: () => getLogPath(),
}
