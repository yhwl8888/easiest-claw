import type { IpcMain } from 'electron'
import { gw } from './gw'

export const registerChatHandlers = (ipcMain: IpcMain): void => {
  // Send a message to an agent
  ipcMain.handle('chat:send', async (_event, params: {
    agentId: string
    message: string
    sessionKey: string
    idempotencyKey: string
    attachments?: Array<{ type: string; mimeType: string; content: string }>
  }) => {
    // Strip agentId — gateway chat.send only accepts: sessionKey, message, idempotencyKey, attachments
    const { sessionKey, message, idempotencyKey, attachments } = params
    const payload: Record<string, unknown> = { sessionKey, message, idempotencyKey }
    if (attachments && attachments.length > 0) payload.attachments = attachments
    return gw('chat.send', payload)
  })

  // Abort an in-flight run
  ipcMain.handle('chat:abort', async (_event, params: { sessionKey?: string; runId?: string }) => {
    return gw('chat.abort', params)
  })

  // Load chat history for a session
  ipcMain.handle('chat:history', async (_event, params: { agentId: string; sessionKey?: string }) => {
    const sessionKey = params.sessionKey ?? `agent:${params.agentId}:main`
    return gw('chat.history', { sessionKey })
  })

  // List sessions
  ipcMain.handle('sessions:list', async (_event, params?: Record<string, unknown>) => {
    return gw('sessions.list', params ?? {})
  })

  // Reset a session
  ipcMain.handle('sessions:reset', async (_event, params: { sessionKey: string }) => {
    return gw('sessions.reset', params)
  })

  // Patch session settings (e.g. thinking/verbose toggles)
  ipcMain.handle('sessions:patch', async (_event, params: { sessionKey: string; patch: Record<string, unknown> }) => {
    return gw('sessions.patch', params)
  })
}
