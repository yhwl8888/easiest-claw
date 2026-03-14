// device-identity.ts — Ed25519 设备身份管理（与 OpenClaw Node.js 端实现一致）
// 使用 node:crypto 内置模块，无额外依赖

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'

// Ed25519 SPKI DER 头部（12 字节）：SEQUENCE { SEQUENCE { OID 1.3.101.112 } BIT STRING }
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer
  // Ed25519 SPKI = 12 字节前缀 + 32 字节原始公钥
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

/** 将 PEM 公钥提取为 base64url 编码的原始 32 字节 */
export function publicKeyRawBase64Url(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem))
}

function fingerprintPublicKey(publicKeyPem: string): string {
  return createHash('sha256').update(derivePublicKeyRaw(publicKeyPem)).digest('hex')
}

// ── 类型 ──────────────────────────────────────────────────────────────────────

export type DeviceIdentity = {
  deviceId: string      // SHA-256(publicKey)，32 字节 hex（小写）
  publicKeyPem: string  // PEM SPKI 格式
  privateKeyPem: string // PEM PKCS8 格式
}

type StoredIdentity = {
  version: 1
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
  createdAtMs: number
}

// ── 生成 / 加载 ───────────────────────────────────────────────────────────────

function generateNewIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  return { deviceId: fingerprintPublicKey(publicKeyPem), publicKeyPem, privateKeyPem }
}

/**
 * 加载已有身份或生成新身份，持久化到 filePath。
 * 文件权限 0o600（仅当前用户可读写）。
 */
export function loadOrCreateDeviceIdentity(filePath: string): DeviceIdentity {
  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as StoredIdentity
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyPem === 'string' &&
        typeof parsed.privateKeyPem === 'string'
      ) {
        // 重新派生 deviceId 以处理可能的数据损坏
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem)
        if (derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = { ...parsed, deviceId: derivedId }
          writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 })
        }
        return { deviceId: derivedId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem }
      }
    }
  } catch { /* 文件损坏或不存在，重新生成 */ }

  const identity = generateNewIdentity()
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  }
  writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 })
  try { chmodSync(filePath, 0o600) } catch { /* Windows 不支持 chmod，忽略 */ }
  return identity
}

// ── 签名 ──────────────────────────────────────────────────────────────────────

/** 用私钥对 payload 字符串进行 Ed25519 签名，返回 base64url */
export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = createPrivateKey(privateKeyPem)
  const sig = sign(null, Buffer.from(payload, 'utf8'), key) as Buffer
  return base64UrlEncode(sig)
}

// ── Payload 构造（v3 格式，与 OpenClaw src/gateway/device-auth.ts 一致）────────

// 与服务端 normalizeDeviceMetadataForAuth 完全一致：
// - undefined/null/空字符串 → "" (空字符串，非 "null")
// - 非空字符串 → 仅转换 ASCII 大写为小写
function normalizeDeviceMeta(val: string | undefined | null): string {
  if (typeof val !== 'string') return ''
  const trimmed = val.trim()
  return trimmed ? trimmed.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)) : ''
}

export type BuildDeviceAuthPayloadParams = {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token: string | null
  nonce: string
  platform?: string
  deviceFamily?: string
}

/**
 * 构造 v3 签名负载字符串：
 * "v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily"
 */
export function buildDeviceAuthPayload(params: BuildDeviceAuthPayloadParams): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
    normalizeDeviceMeta(params.platform),
    normalizeDeviceMeta(params.deviceFamily), // 桌面应用不发送 deviceFamily → server 重建时得到 "" → 我们也用 normalizeDeviceMeta(undefined) = ""
  ].join('|')
}
