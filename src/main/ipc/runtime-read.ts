import type { IpcMain } from 'electron'
import { getRuntime } from '../gateway/runtime'
import type { ConnectionStatus } from '../gateway/types'
import { logger } from '../lib/logger'

export const registerRuntimeHandlers = (ipcMain: IpcMain): void => {
  // Get current connection status
  ipcMain.handle('runtime:status', async () => {
    const adapter = getRuntime()
    if (!adapter) {
      return { status: 'stopped' as ConnectionStatus, reason: null }
    }
    return { status: adapter.getStatus(), reason: adapter.getStatusReason() }
  })

  // Fetch agent fleet (list + session keys)
  ipcMain.handle('runtime:fleet', async () => {
    const adapter = getRuntime()
    if (!adapter) return { ok: false, error: 'Gateway not connected.' }
    try {
      const [agentsRes, sessionsRes] = await Promise.allSettled([
        adapter.request<{ agents: Array<{ agentId: string; name?: string }> }>('agents.list', {}),
        adapter.request<{ sessions: Array<{ sessionKey: string; agentId?: string }> }>('sessions.list', {})
      ])

      const agentsPayload = agentsRes.status === 'fulfilled'
        ? agentsRes.value as { defaultId?: string; agents?: Array<{ id?: string; agentId?: string; name?: string; identity?: { emoji?: string } }> }
        : { agents: [] }
      const rawAgents = agentsPayload.agents ?? []
      const mainAgentId = agentsPayload.defaultId ?? null
      const sessions = sessionsRes.status === 'fulfilled' ? (sessionsRes.value as { sessions?: unknown[] }).sessions ?? [] : []

      // Normalize: OpenClaw returns { id, name?, identity? } — map to { agentId, name, sessionKey, emoji }
      const agents = rawAgents.map((a) => ({
        agentId: a.agentId ?? a.id ?? '',
        name: a.name ?? a.agentId ?? a.id ?? '',
        sessionKey: `agent:${a.agentId ?? a.id ?? ''}:main`,
        emoji: a.identity?.emoji,
      }))

      return { ok: true, result: { agents, sessions, mainAgentId } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  })

  // Expose log file path so renderer can display it for debugging
  ipcMain.handle('logs:getPath', () => logger.getPath())
}
