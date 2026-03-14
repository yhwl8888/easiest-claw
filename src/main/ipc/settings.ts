import type { IpcMain } from 'electron'
import { loadSettings, patchSettings, loadOpenclawDefaults } from '../gateway/settings'
import { restartRuntime } from '../gateway/runtime'

export const registerSettingsHandlers = (ipcMain: IpcMain): void => {
  // Load current app settings (gateway URL/token, avatars)
  ipcMain.handle('settings:get', async () => {
    const settings = loadSettings()
    // Redact token from response — renderer doesn't need to display it
    return {
      gateway: settings.gateway
        ? { url: settings.gateway.url, hasToken: Boolean(settings.gateway.token) }
        : null,
      avatars: settings.avatars
    }
  })

  // Get full settings including token (for settings form)
  ipcMain.handle('settings:get-full', async () => {
    return loadSettings()
  })

  // Save gateway connection settings and restart
  ipcMain.handle('settings:save-gateway', async (_event, params: { url: string; token: string }) => {
    try {
      patchSettings({ gateway: { url: params.url.trim(), token: params.token.trim() } })
      await restartRuntime()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to save settings' }
    }
  })

  // Save avatar for an agent
  ipcMain.handle('settings:save-avatar', async (_event, params: { gatewayUrl: string; agentId: string; seed: string }) => {
    const current = loadSettings()
    const gatewayKey = params.gatewayUrl || current.gateway?.url || 'local'
    patchSettings({
      avatars: {
        ...current.avatars,
        [gatewayKey]: {
          ...(current.avatars[gatewayKey] ?? {}),
          [params.agentId]: params.seed
        }
      }
    })
    return { ok: true }
  })

  // Auto-detect local openclaw settings
  ipcMain.handle('settings:detect-local', async () => {
    const defaults = loadOpenclawDefaults()
    return defaults ?? null
  })
}
