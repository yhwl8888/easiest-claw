import type { IpcMain } from 'electron'
import { app } from 'electron'
import fs from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'
import https from 'https'
import { spawn } from 'child_process'
import { stopGatewayProcess, restartBundledGateway, getBundledOpenclawVersion, waitForPortClosed } from '../gateway/bundled-process'

const REGISTRY = 'https://registry.npmmirror.com'
const REGISTRY_FALLBACK = 'https://registry.npmjs.org'

const UNUSED_LARGE_PKGS = [
  'koffi', 'pdfjs-dist', 'node-llama-cpp', '@node-llama-cpp',
  'playwright-core', '@playwright', 'typescript', '@cloudflare',
]

// ── Fake git 脚本（Node.js CJS，不依赖系统 git）──────────────────────────────
// npm 在安装 git URL 依赖时会调用 git ls-remote / git clone。
// 我们注入一个假的 git 可执行文件拦截这些调用：
//   ls-remote → 返回假的哈希，让 npm 认为引用是 commit hash
//   clone     → 在目标目录创建最小的空包，让 npm 认为克隆成功
//   其他命令  → 直接 exit 0
const FAKE_GIT_JS = `#!/usr/bin/env node
'use strict';
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'ls-remote') {
  // npm 调用: git ls-remote <url> <ref>
  // 返回一个假的哈希，让 npm 把它当作 commit hash 缓存
  process.stdout.write('0000000000000000000000000000000000000000\\tHEAD\\n');
  process.exit(0);
}

if (cmd === 'clone') {
  // npm 调用: git clone <url> <dest> [--depth 1 ...]
  // 在目标目录放一个最小的 package.json + index.js，让 npm 认为克隆成功
  const fs = require('fs');
  const path = require('path');
  // args: clone [--depth 1] [--no-local] ... <url> <dest>
  // 找到最后一个非 flag 参数作为目标目录
  const dest = args.filter(a => !a.startsWith('-')).pop();
  if (dest) {
    try {
      fs.mkdirSync(dest, { recursive: true });
      const pkg = { name: 'stub', version: '0.0.1', main: 'index.js' };
      fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(pkg));
      fs.writeFileSync(path.join(dest, 'index.js'), 'module.exports = {};\\n');
    } catch (_) {}
  }
  process.exit(0);
}

// 其他 git 子命令（fetch、rev-parse 等）直接成功退出
process.exit(0);
`

// 与 bundle-openclaw.mjs 保持同步的包装脚本内容
const EASIEST_CLAW_GATEWAY_SCRIPT = `/**
 * easiest-claw-gateway.mjs — EasiestClaw 包装入口
 * 在 Windows 上 patch child_process，然后启动真正的 OpenClaw Gateway。
 */
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

// openclaw entry.js 的 isMainModule() 通过 argv[1] 或 pm_exec_path 判断主入口。
// easiest-claw-gateway.mjs 不在 ENTRY_WRAPPER_PAIRS 白名单中，需设置 pm_exec_path
// 让 isMainModule 检测通过，否则 entry.js 会跳过执行直接退出（code 0）。
process.env.pm_exec_path = join(dirname(fileURLToPath(import.meta.url)), 'dist', 'entry.js')

if (process.platform === 'win32') {
  const require = createRequire(import.meta.url)
  const cp = require('child_process')

  const _spawn = cp.spawn
  cp.spawn = function (cmd, args, opts) {
    if (!Array.isArray(args)) { opts = args; args = [] }
    return _spawn.call(this, cmd, args, Object.assign({ windowsHide: true }, opts || {}))
  }

  const _spawnSync = cp.spawnSync
  cp.spawnSync = function (cmd, args, opts) {
    if (!Array.isArray(args)) { opts = args; args = [] }
    return _spawnSync.call(this, cmd, args, Object.assign({ windowsHide: true }, opts || {}))
  }

  const _execFile = cp.execFile
  cp.execFile = function (file, args, opts, cb) {
    if (typeof args === 'function') { cb = args; args = []; opts = {} }
    else if (!Array.isArray(args)) { cb = opts; opts = typeof args === 'object' ? args : {}; args = [] }
    else if (typeof opts === 'function') { cb = opts; opts = {} }
    return _execFile.call(this, file, args, Object.assign({ windowsHide: true }, opts || {}), cb)
  }

  const _exec = cp.exec
  cp.exec = function (cmd, opts, cb) {
    if (typeof opts === 'function') { cb = opts; opts = {} }
    return _exec.call(this, cmd, Object.assign({ windowsHide: true }, opts || {}), cb)
  }

  const _execSync = cp.execSync
  cp.execSync = function (cmd, opts) {
    return _execSync.call(this, cmd, Object.assign({ windowsHide: true }, opts || {}))
  }
}

await import('./openclaw.mjs')
`

// ── 路径工具 ──────────────────────────────────────────────────────────────────
function getOpenclawDir(): string | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'openclaw')]
    : [join(app.getAppPath(), 'build', 'openclaw')]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'openclaw.mjs'))) return dir
  }
  return null
}

// ── 版本比较（支持 YYYY.M.D 和 semver，忽略提交哈希后缀）──────────────────────
function parseVersion(v: string): number[] {
  // 去掉空格后的内容：'2026.3.8 (3caab92)' → '2026.3.8'
  const clean = v.trim().replace(/\s.*$/, '').replace(/^[^0-9]*/, '')
  return clean.split('.').map(s => { const n = parseInt(s, 10); return isNaN(n) ? 0 : n })
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    if (ai > bi) return true
    if (ai < bi) return false
  }
  return false
}

// ── npm registry 查询 ─────────────────────────────────────────────────────────
async function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(`${REGISTRY}/openclaw/latest`, { timeout: 10_000 }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        try { resolve((JSON.parse(data) as { version?: string }).version ?? null) }
        catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

async function readCurrentVersion(): Promise<string | null> {
  const dir = getOpenclawDir()
  return dir ? getBundledOpenclawVersion(dir) : null
}

// ── 升级执行 ──────────────────────────────────────────────────────────────────
type ProgressSender = (step: string, status: 'running' | 'done' | 'error', detail?: string) => void

// ── 直接下载 tarball（无需 git）──────────────────────────────────────────────

/** 从 registry 获取指定版本的 tarball 下载 URL */
async function fetchTarballUrl(version: string, registry: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(`${registry}/openclaw/${encodeURIComponent(version)}`, { timeout: 15_000 }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        try {
          const meta = JSON.parse(data) as { dist?: { tarball?: string } }
          resolve(meta.dist?.tarball ?? null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

/** 下载文件到本地路径（支持 HTTP 重定向） */
function downloadFile(url: string, dest: string, maxRedirects = 5): Promise<boolean> {
  return new Promise((resolve) => {
    const tryGet = (u: string, left: number) => {
      https.get(u, { timeout: 120_000 }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && left > 0) {
          res.resume()
          tryGet(res.headers.location, left - 1)
          return
        }
        if (res.statusCode !== 200) { res.resume(); resolve(false); return }
        const file = fs.createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve(true) })
        file.on('error', () => resolve(false))
      }).on('error', () => resolve(false))
    }
    tryGet(url, maxRedirects)
  })
}

/** 将 package.json 中所有 git URL 依赖替换为本地空 stub，避免 npm install 调用 git */
async function patchGitDeps(pkgDir: string, stubsDir: string, send: ProgressSender): Promise<void> {
  const pkgJsonPath = join(pkgDir, 'package.json')
  try {
    const pkgJson = JSON.parse(await fs.promises.readFile(pkgJsonPath, 'utf8')) as Record<string, unknown>
    const deps = pkgJson.dependencies as Record<string, string> | undefined
    if (!deps) return
    let modified = false
    for (const [name, ver] of Object.entries(deps)) {
      const isGit = typeof ver === 'string' && (
        ver.startsWith('git+') || ver.startsWith('git://') ||
        ver.startsWith('github:') || ver.startsWith('bitbucket:') ||
        /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]/.test(ver)  // shorthand: "user/repo"
      )
      if (!isGit) continue
      const stubDir = join(stubsDir, name.replace(/\//g, '+'))
      await fs.promises.mkdir(stubDir, { recursive: true })
      await fs.promises.writeFile(join(stubDir, 'package.json'), JSON.stringify({ name, version: '0.0.1', main: 'index.js' }))
      await fs.promises.writeFile(join(stubDir, 'index.js'), 'module.exports = {};\n')
      deps[name] = `file:${stubDir.replace(/\\/g, '/')}`
      send('download', 'running', `stub git dep: ${name}`)
      modified = true
    }
    if (modified) await fs.promises.writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2))
  } catch { /* 修改失败不中断，让 npm install 继续尝试 */ }
}

/** 在 tmpDir 下创建假的 git 可执行文件，返回包含它的目录路径 */
async function createFakeGit(tmpDir: string): Promise<string> {
  const nodeExe = app.isPackaged
    ? (process.platform === 'win32'
      ? join(process.resourcesPath, 'node', 'node.exe')
      : join(process.resourcesPath, 'node', 'node'))
    : (process.platform === 'win32'
      ? join(app.getAppPath(), 'resources', 'node', 'node.exe')
      : join(app.getAppPath(), 'resources', 'node', 'node'))

  const fakeGitDir = join(tmpDir, '_fake-git')
  await fs.promises.mkdir(fakeGitDir, { recursive: true })

  // 写入 Node.js 脚本
  const scriptPath = join(fakeGitDir, 'fake-git.js')
  await fs.promises.writeFile(scriptPath, FAKE_GIT_JS)

  if (process.platform === 'win32') {
    // Windows：写 git.cmd，通过 @<node> 调用脚本
    const nodeExeForward = nodeExe.replace(/\\/g, '\\\\')
    const scriptPathForward = scriptPath.replace(/\\/g, '\\\\')
    const cmd = `@"${nodeExeForward}" "${scriptPathForward}" %*\r\n`
    await fs.promises.writeFile(join(fakeGitDir, 'git.cmd'), cmd)
  } else {
    // macOS / Linux：写 git shell script
    const sh = `#!/bin/sh\nexec "${nodeExe}" "${scriptPath}" "$@"\n`
    const gitPath = join(fakeGitDir, 'git')
    await fs.promises.writeFile(gitPath, sh)
    await fs.promises.chmod(gitPath, 0o755)
  }

  return fakeGitDir
}

/** 在指定目录内运行 npm install --production（fakeGitDir 注入 PATH 前缀）*/
function runNpmInDir(dir: string, registry: string, fakeGitDir: string, send: ProgressSender): Promise<boolean> {
  const nodeDir = app.isPackaged
    ? join(process.resourcesPath, 'node')
    : join(app.getAppPath(), 'resources', 'node')

  const installArgs = ['install', '--production', '--registry', registry,
    '--no-audit', '--no-fund']

  let cmd: string, args: string[], shell: boolean
  if (process.platform === 'win32') {
    cmd = join(nodeDir, 'npm.cmd')
    args = installArgs
    shell = true
  } else {
    const npmCli = join(nodeDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    cmd = join(nodeDir, 'node')
    args = [npmCli, ...installArgs]
    shell = false
  }

  // 将 fakeGitDir 注入 PATH 前缀，让 npm 的 git 调用全部命中我们的假脚本
  const pathSep = process.platform === 'win32' ? ';' : ':'
  const envPath = `${fakeGitDir}${pathSep}${process.env.PATH ?? ''}`

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: dir, shell, windowsHide: true,
      env: { ...process.env, PATH: envPath },
    })
    const handleOut = (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) send('download', 'running', line.trim())
      }
    }
    child.stdout?.on('data', handleOut)
    child.stderr?.on('data', handleOut)
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/**
 * 主下载函数：直接下载 tarball → tar 解压 → patch git deps → npm install
 * 全程不需要系统安装 git。
 * 返回解压后的 openclaw 包目录路径，失败返回 null。
 */
async function downloadAndInstall(
  version: string, registry: string, tmpDir: string, send: ProgressSender
): Promise<string | null> {
  // 1. 获取 tarball URL
  send('download', 'running', `查询 ${registry} 包信息...`)
  const tarballUrl = await fetchTarballUrl(version, registry)
  if (!tarballUrl) {
    send('download', 'running', `${registry} 无法获取 openclaw@${version} 信息`)
    return null
  }

  // 2. 下载 .tgz（纯 HTTPS，无需 npm/git）
  const tgzPath = join(tmpDir, 'openclaw.tgz')
  send('download', 'running', `正在下载 openclaw@${version}...`)
  if (!await downloadFile(tarballUrl, tgzPath)) {
    send('download', 'running', '下载失败')
    return null
  }

  // 3. 用系统内置 tar 解压（Windows 10+ / macOS / Linux 均有）
  const extractDir = join(tmpDir, 'extracted')
  await fs.promises.mkdir(extractDir, { recursive: true })
  send('download', 'running', '正在解压...')
  const extractOk = await new Promise<boolean>((resolve) => {
    const child = spawn('tar', ['-xzf', tgzPath, '-C', extractDir], { windowsHide: true })
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
  if (!extractOk) {
    send('download', 'running', 'tar 解压失败')
    return null
  }

  // npm tarball 解压后内容在 package/ 子目录
  const pkgDir = join(extractDir, 'package')
  if (!existsSync(pkgDir)) {
    send('download', 'running', '解压结构异常，找不到 package/ 目录')
    return null
  }

  // 4. 将 package.json 中的 git URL 依赖替换为本地空 stub（快速路径）
  const stubsDir = join(tmpDir, '_stubs')
  await fs.promises.mkdir(stubsDir, { recursive: true })
  await patchGitDeps(pkgDir, stubsDir, send)

  // 5. 创建假 git 并在解压目录中安装依赖
  send('download', 'running', '正在安装依赖...')
  const fakeGitDir = await createFakeGit(tmpDir)
  if (!await runNpmInDir(pkgDir, registry, fakeGitDir, send)) {
    send('download', 'running', 'npm install 失败')
    return null
  }

  return pkgDir
}

async function performUpgrade(
  version: string, openclawDir: string, send: ProgressSender
): Promise<{ ok: boolean; error?: string }> {
  const tmpDir = join(os.tmpdir(), `openclaw-update-${Date.now()}`)
  await fs.promises.mkdir(tmpDir, { recursive: true })

  try {
    // ── 1. Stop gateway ───────────────────────────────────────────────────────
    send('stop', 'running', '正在停止 Gateway...')
    stopGatewayProcess()
    // 等待 TCP 端口真正释放，避免 Windows 文件锁导致后续替换失败
    const portClosed = await waitForPortClosed(18789, 10_000)
    if (!portClosed) {
      send('stop', 'running', 'Gateway 端口释放较慢，继续等待...')
      await new Promise(r => setTimeout(r, 3000))
    }
    send('stop', 'done', 'Gateway 已停止')

    // ── 2. 下载 tarball → 解压 → patch git deps → npm install ──────────────────
    send('download', 'running', `正在下载 openclaw@${version}...`)
    let newSrc: string | null = null
    for (const registry of [REGISTRY, REGISTRY_FALLBACK]) {
      newSrc = await downloadAndInstall(version, registry, tmpDir, send)
      if (newSrc) break
      send('download', 'running', `${registry} 失败，切换到下一个源...`)
    }
    if (!newSrc) {
      send('download', 'error', '下载失败，请检查网络')
      return { ok: false, error: '下载失败' }
    }
    send('download', 'done', `openclaw@${version} 下载完成`)

    // ── 3. 替换源文件（保留 node_modules，单独处理）────────────────────────────
    send('install', 'running', '正在更新 OpenClaw 源文件...')
    const openclawEntries = await fs.promises.readdir(openclawDir)
    await Promise.all(
      openclawEntries
        .filter(entry => entry !== 'node_modules')
        .map(entry => fs.promises.rm(join(openclawDir, entry), { recursive: true, force: true }))
    )
    const newSrcEntries = await fs.promises.readdir(newSrc)
    await Promise.all(
      newSrcEntries
        .filter(entry => entry !== 'node_modules')
        .map(entry => fs.promises.cp(join(newSrc, entry), join(openclawDir, entry), { recursive: true }))
    )

    // ── 4. 更新 node_modules ─────────────────────────────────────────────────
    send('install', 'running', '正在更新依赖...')
    const outMods = join(openclawDir, 'node_modules')
    await fs.promises.mkdir(outMods, { recursive: true })
    const tmpMods = join(newSrc, 'node_modules')
    if (existsSync(tmpMods)) {
      const pkgEntries = await fs.promises.readdir(tmpMods)
      for (const pkg of pkgEntries) {
        if (pkg === '.package-lock.json') continue
        const dest = join(outMods, pkg)
        if (existsSync(dest)) await fs.promises.rm(dest, { recursive: true, force: true })
        await fs.promises.cp(join(tmpMods, pkg), dest, { recursive: true })
      }
    }

    // ── 5. 删除不需要的大包 ───────────────────────────────────────────────────
    await Promise.all(
      UNUSED_LARGE_PKGS.map(async (pkg) => {
        const p = join(outMods, pkg)
        if (existsSync(p)) {
          await fs.promises.rm(p, { recursive: true, force: true })
          send('install', 'running', `已删除 ${pkg}`)
        }
      })
    )

    // ── 6. 写入 easiest-claw-gateway.mjs（含 pm_exec_path 修复）──────────────────
    await fs.promises.writeFile(join(openclawDir, 'easiest-claw-gateway.mjs'), EASIEST_CLAW_GATEWAY_SCRIPT)
    send('install', 'done', `文件更新完成，当前版本 ${version}`)

    // ── 7. 重启 Gateway（强制 fork 内置，跳过 autoSpawn 的端口前置检查）───────────
    send('start', 'running', '正在重启 Gateway...')
    const started = await restartBundledGateway()
    if (!started) {
      send('start', 'error', 'Gateway 重启超时，请重新打开应用')
      return { ok: false, error: 'Gateway 重启超时' }
    }
    send('start', 'done', 'Gateway 已重启')

    return { ok: true }
  } finally {
    try { await fs.promises.rm(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
export const registerUpdateHandlers = (ipcMain: IpcMain): void => {

  // 检查更新
  ipcMain.handle('openclaw:check-update', async () => {
    const current = await readCurrentVersion()
    const latest = await fetchLatestVersion()
    const hasUpdate = !!(current && latest && isNewer(latest, current))
    return { ok: true, result: { current, latest, hasUpdate } }
  })

  // 执行升级（统一走内置路径）
  ipcMain.handle('openclaw:upgrade', async (event, { version }: { version: string }) => {
    const send: ProgressSender = (step, status, detail) => {
      console.log(`[Update:${step}][${status}] ${detail ?? ''}`)
      try { event.sender.send('openclaw:upgrade-progress', { step, status, detail }) } catch {}
    }

    const openclawDir = getOpenclawDir()
    if (!openclawDir) return { ok: false, error: '找不到内置 OpenClaw 目录' }
    return performUpgrade(version, openclawDir, send)
  })
}
