import type { IpcMain } from 'electron'
import https from 'https'
import http from 'http'

interface HealthCheckParams {
  baseUrl: string
  apiKey: string
  api: string
}

function doRequest(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume()
        resolve({ status: res.statusCode ?? 0 })
      }
    )
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
    req.end()
  })
}

export const registerProviderHealthHandlers = (ipcMain: IpcMain): void => {
  ipcMain.handle('provider:health-check', async (_, params: HealthCheckParams) => {
    const { baseUrl, apiKey, api } = params
    const cleanBase = baseUrl.replace(/\/+$/, '')
    const headers: Record<string, string> =
      api === 'anthropic-messages'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${apiKey}` }

    const start = Date.now()
    try {
      const { status } = await doRequest(`${cleanBase}/models`, headers, 10_000)
      const latencyMs = Date.now() - start
      // 只要服务器有响应（1xx-4xx）就视为可达；5xx 才算服务器异常
      // 404 = 无 /models 端点但服务器正常；401/403 = 认证问题
      if (status >= 500) {
        return { ok: true, healthy: false, latencyMs, error: `HTTP ${status}` }
      }
      if (status === 401 || status === 403) {
        return { ok: true, healthy: false, latencyMs, error: `认证失败 (HTTP ${status})，请检查 API Key` }
      }
      return { ok: true, healthy: true, latencyMs }
    } catch (err) {
      return { ok: true, healthy: false, error: String(err) }
    }
  })
}
