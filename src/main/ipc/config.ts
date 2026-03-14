import type { IpcMain } from 'electron'
import { gw } from './gw'
import { isRecord, readOpenclawConfig, writeOpenclawConfig } from '../lib/openclaw-config'

// Keep agents.defaults.models in sync with models.providers
const syncAllowedModels = (config: Record<string, unknown>): void => {
  const agents = isRecord(config.agents) ? config.agents : null
  const defaults = isRecord(agents?.defaults) ? (agents.defaults as Record<string, unknown>) : null
  if (!defaults) return
  const currentModels = isRecord(defaults.models) ? defaults.models : null
  if (!currentModels) return

  const next: Record<string, unknown> = {}
  const providers = isRecord((config.models as Record<string, unknown>)?.providers)
    ? ((config.models as Record<string, unknown>).providers as Record<string, unknown>)
    : {}

  for (const [pid, prov] of Object.entries(providers)) {
    if (!isRecord(prov)) continue
    const models = Array.isArray(prov.models) ? prov.models : []
    for (const model of models) {
      const mid = typeof model === 'string' ? model : isRecord(model) ? (model.id as string) : null
      if (!pid || !mid) continue
      const key = `${pid}/${mid}`
      next[key] = isRecord(currentModels[key]) ? currentModels[key] : {}
    }
  }

  defaults.models = next
}

export const registerConfigHandlers = (ipcMain: IpcMain): void => {
  // Get full config (includes hash for optimistic concurrency)
  ipcMain.handle('config:get', async () => {
    return gw('config.get', {})
  })

  // Partial update (JSON merge patch)
  ipcMain.handle('config:patch', async (_event, params: { raw: string; baseHash: string }) => {
    return gw('config.patch', params)
  })

  // Full replace + restart
  ipcMain.handle('config:apply', async (_event, params: { raw: string; baseHash: string; sessionKey?: string }) => {
    return gw('config.apply', params)
  })

  // Get config JSON schema (for form rendering)
  ipcMain.handle('config:schema', async () => {
    return gw('config.schema', {})
  })

  // Exec approvals
  ipcMain.handle('exec:approvals:get', async (_event, params: { agentId?: string }) => {
    return gw('exec.approvals.get', params)
  })

  ipcMain.handle('exec:approvals:set', async (_event, params: unknown) => {
    return gw('exec.approvals.set', params)
  })

  ipcMain.handle('exec:approval:resolve', async (_event, params: { requestId: string; decision: 'allow' | 'deny' }) => {
    return gw('exec.approval.resolve', params)
  })

  // ── Direct file access: read/write openclaw.json for model config ─────────
  ipcMain.handle('openclaw:models:get', () => {
    try {
      const config = readOpenclawConfig()
      const models = isRecord(config.models) ? config.models : {}
      const providers = isRecord(models.providers) ? models.providers : {}
      const agents = isRecord(config.agents) ? config.agents : {}
      const agentDefaults = isRecord(agents.defaults) ? agents.defaults : {}
      const model = isRecord(agentDefaults.model) ? agentDefaults.model : {}
      return {
        ok: true,
        providers,
        defaults: {
          primary: typeof model.primary === 'string' ? model.primary : '',
          fallbacks: Array.isArray(model.fallbacks) ? model.fallbacks : [],
        },
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('openclaw:models:set', (_event, params: {
    providers?: Record<string, unknown>
    defaults?: { primary: string; fallbacks: string[] }
  }) => {
    try {
      const config = readOpenclawConfig()

      if (params.providers !== undefined) {
        if (!isRecord(config.models)) config.models = {}
        ;(config.models as Record<string, unknown>).providers = params.providers
      }

      if (params.defaults !== undefined) {
        if (!isRecord(config.agents)) config.agents = {}
        const agentsObj = config.agents as Record<string, unknown>
        if (!isRecord(agentsObj.defaults)) agentsObj.defaults = {}
        const defaultsObj = agentsObj.defaults as Record<string, unknown>
        const currentModel: Record<string, unknown> = isRecord(defaultsObj.model)
          ? { ...(defaultsObj.model as Record<string, unknown>) }
          : {}

        const primary = params.defaults.primary?.trim() ?? ''
        if (primary) {
          currentModel.primary = primary
        } else {
          delete currentModel.primary
        }

        const fallbacks = (params.defaults.fallbacks ?? [])
          .filter((x) => typeof x === 'string' && x.trim())
          .map((x) => x.trim())
        if (fallbacks.length > 0) {
          currentModel.fallbacks = fallbacks
        } else {
          delete currentModel.fallbacks
        }

        if (Object.keys(currentModel).length > 0) {
          defaultsObj.model = currentModel
        } else {
          delete defaultsObj.model
        }
      }

      syncAllowedModels(config)
      writeOpenclawConfig(config)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
