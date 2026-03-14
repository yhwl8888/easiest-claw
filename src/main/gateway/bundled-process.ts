import { app, utilityProcess } from 'electron'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'
import net from 'net'
import { existsSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { patchSettings } from './settings'
import { sanitizeOpenClawConfig } from '../openclaw-init'
import { getOpenclawConfigPath } from '../lib/openclaw-config'

export const GATEWAY_PORT = 18789

export type GatewaySource = 'bundled' | 'external' | 'none'

let gatewaySource: GatewaySource = 'none'
let portConflictPending = false

export function getGatewaySource(): GatewaySource { return gatewaySource }
export function setGatewaySource(s: GatewaySource): void { gatewaySource = s }
export function isPortConflictPending(): boolean { return portConflictPending }
export function setPortConflictPending(v: boolean): void { portConflictPending = v }

// ── Path utilities ─────────────────────────────────────────────────────────────
export function getBundledOpenclaw(): { openclawDir: string; entryScript: string } | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'openclaw')]
    : [join(app.getAppPath(), 'build', 'openclaw')]

  for (const openclawDir of candidates) {
    const wrapper = join(openclawDir, 'easiest-claw-gateway.mjs')
    const entryScript = existsSync(wrapper) ? wrapper : join(openclawDir, 'openclaw.mjs')
    if (existsSync(entryScript)) return { openclawDir, entryScript }
  }
  return null
}

export function getBundledNodeBin(): string {
  const nodeDir = app.isPackaged
    ? join(process.resourcesPath, 'node')
    : join(app.getAppPath(), 'resources', 'node')
  return process.platform === 'win32'
    ? join(nodeDir, 'node.exe')
    : join(nodeDir, 'node')
}

// ── Gateway config ─────────────────────────────────────────────────────────────
export function readGatewayToken(): string | null {
  try {
    const configPath = getOpenclawConfigPath()
    if (!existsSync(configPath)) return null
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const auth = ((parsed.gateway as Record<string, unknown>)?.auth) as Record<string, unknown> | undefined
    const token = auth?.token
    return typeof token === 'string' && token.trim() ? token.trim() : null
  } catch {
    return null
  }
}

export function readGatewayPort(): number {
  try {
    const configPath = getOpenclawConfigPath()
    if (!existsSync(configPath)) return GATEWAY_PORT
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const port = ((parsed.gateway as Record<string, unknown>)?.port) as number | undefined
    return typeof port === 'number' && port > 0 ? port : GATEWAY_PORT
  } catch {
    return GATEWAY_PORT
  }
}

export function writeGatewayConfig(token: string): void {
  const configPath = getOpenclawConfigPath()
  const configDir = join(os.homedir(), '.openclaw')

  if (!existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  let config: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    } catch { /* start fresh */ }
  }

  const existingGateway = (config.gateway as Record<string, unknown>) ?? {}
  config.gateway = {
    ...existingGateway,
    port: GATEWAY_PORT,
    bind: 'loopback',
    mode: 'local',
    auth: { mode: 'token', token },
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

// ── TCP port probing ────────────────────────────────────────────────────────────
export async function waitForPortClosed(port: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => { socket.destroy(); resolve(false) })
      socket.setTimeout(800, () => { socket.destroy(); resolve(false) })
    })
    if (!open) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

export async function checkPortOpen(port: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => { socket.destroy(); resolve(false) })
      socket.setTimeout(800, () => { socket.destroy(); resolve(false) })
    })
    if (open) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

export async function waitForGatewayReady(maxMs: number): Promise<boolean> {
  return checkPortOpen(GATEWAY_PORT, maxMs)
}

// ── Bundled openclaw version ────────────────────────────────────────────────────
export async function getBundledOpenclawVersion(openclawDir: string): Promise<string | null> {
  try {
    const pkgPath = join(openclawDir, 'package.json')
    const content = await fs.promises.readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(content)
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

// ── Gateway process ─────────────────────────────────────────────────────────────
type GatewayLogListener = (line: string, isError: boolean) => void
const gatewayLogListeners = new Set<GatewayLogListener>()

export function addGatewayLogListener(fn: GatewayLogListener): () => void {
  gatewayLogListeners.add(fn)
  return () => gatewayLogListeners.delete(fn)
}

let gatewayProcess: Electron.UtilityProcess | null = null

export function isBundledGatewayActive(): boolean {
  return gatewayProcess !== null
}

export function stopGatewayProcess(): void {
  if (gatewayProcess) {
    try { gatewayProcess.kill() } catch {}
    gatewayProcess = null
  }
}

export function forkOpenclawGateway(entryScript: string, openclawDir: string, token: string, force = false): void {
  if (gatewayProcess && !force) return
  if (gatewayProcess && force) {
    console.log('[Gateway] 强制重启：终止旧进程...')
    try { gatewayProcess.kill() } catch {}
    gatewayProcess = null
  }

  const child = utilityProcess.fork(
    entryScript,
    ['gateway', '--port', String(GATEWAY_PORT), '--token', token, '--allow-unconfigured'],
    {
      cwd: openclawDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        OPENCLAW_GATEWAY_TOKEN: token,
        OPENCLAW_NO_RESPAWN: '1',
        OPENCLAW_ALLOW_MULTI_GATEWAY: '1',
      },
      serviceName: 'OpenClaw Gateway',
    }
  )

  const handleLine = (line: string, isError: boolean) => {
    console.log(`[Gateway${isError ? ':err' : ''}]`, line)
    gatewayLogListeners.forEach(fn => fn(line, isError))
  }
  const splitLines = (data: Buffer, isError: boolean) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) handleLine(line.trim(), isError)
    }
  }
  child.stdout?.on('data', (d: Buffer) => splitLines(d, false))
  child.stderr?.on('data', (d: Buffer) => splitLines(d, true))
  child.on('exit', (code) => {
    console.log(`[Gateway] process exited (code=${code})`)
    gatewayProcess = null
  })

  gatewayProcess = child
}

// ── System gateway (via openclaw CLI) ─────────────────────────────────────────
export async function stopSystemGateway(): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('openclaw', ['gateway', 'stop'], {
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    child.on('close', () => resolve())
    child.on('error', () => resolve())
    setTimeout(() => { try { child.kill() } catch {} resolve() }, 5000)
  })
}

export async function restartSystemGateway(): Promise<boolean> {
  const port = readGatewayPort()
  const token = readGatewayToken()
  if (!token) return false

  const child = spawn('openclaw', ['gateway', '--port', String(port), '--token', token, '--allow-unconfigured'], {
    shell: process.platform === 'win32',
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  })
  try { child.unref() } catch {}
  return checkPortOpen(port, 20_000)
}

// ── Auto-spawn & restart bundled openclaw ──────────────────────────────────────
export async function autoSpawnBundledOpenclaw(): Promise<void> {
  const bundledOc = getBundledOpenclaw()
  if (!bundledOc) {
    console.log('[AutoSpawn] 内置 openclaw 不存在，跳过')
    return
  }

  const { openclawDir, entryScript } = bundledOc

  let token = readGatewayToken()
  if (!token) {
    console.log('[AutoSpawn] 首次启动，生成 token 并写入配置...')
    token = crypto.randomBytes(24).toString('hex')
    writeGatewayConfig(token)
    console.log('[AutoSpawn] 配置写入完成')
  } else {
    writeGatewayConfig(token)
  }

  sanitizeOpenClawConfig()
  patchSettings({ gateway: { url: `ws://localhost:${GATEWAY_PORT}`, token } })

  const alreadyUp = await waitForGatewayReady(1500)
  if (alreadyUp) {
    if (gatewayProcess !== null) {
      console.log('[AutoSpawn] 内置 Gateway 已在运行，跳过 fork')
      gatewaySource = 'bundled'
    } else {
      console.log('[AutoSpawn] 端口 18789 已被外部进程占用，等待用户决策...')
      portConflictPending = true
    }
    return
  }

  console.log('[AutoSpawn] 正在 fork 内置 OpenClaw Gateway...')
  forkOpenclawGateway(entryScript, openclawDir, token)

  const ready = await waitForGatewayReady(30_000)
  if (ready) {
    gatewaySource = 'bundled'
    console.log('[AutoSpawn] 内置 Gateway 已就绪')
  } else {
    console.warn('[AutoSpawn] 内置 Gateway 30s 内未就绪，继续（连接层将自动重试）')
  }
}

export async function restartBundledGateway(): Promise<boolean> {
  const bundledOc = getBundledOpenclaw()
  if (!bundledOc) {
    console.warn('[RestartBundled] 找不到内置 openclaw 目录')
    return false
  }
  const { openclawDir, entryScript } = bundledOc

  let token = readGatewayToken()
  if (!token) {
    token = crypto.randomBytes(24).toString('hex')
    writeGatewayConfig(token)
  }

  patchSettings({ gateway: { url: `ws://localhost:${GATEWAY_PORT}`, token } })
  forkOpenclawGateway(entryScript, openclawDir, token, true)

  const ready = await waitForGatewayReady(30_000)
  if (ready) {
    console.log('[RestartBundled] Gateway 已就绪')
  } else {
    console.warn('[RestartBundled] Gateway 30s 内未就绪')
  }
  return ready
}
