import type { IpcMain } from 'electron'
import { gw } from './gw'
import { isRecord, readOpenclawConfig as readConfig, writeOpenclawConfig as writeConfig } from '../lib/openclaw-config'

export const registerSkillsHandlers = (ipcMain: IpcMain): void => {
  // Get global skills list from gateway
  ipcMain.handle('skills:list', async () => {
    return gw('skills.status', {})
  })

  // Toggle a skill globally via gateway
  ipcMain.handle('skills:toggle', async (_event, params: { name: string; enabled: boolean }) => {
    return gw('skills.update', { name: params.name, enabled: params.enabled })
  })

  // Get per-agent skill allowlist from openclaw.json
  // Returns: { ok: true, skills: string[] | null }
  // null = all skills enabled (no custom allowlist)
  // string[] = only these skills are allowed ([] = none)
  ipcMain.handle('openclaw:agent-skills:get', (_event, agentId: string) => {
    try {
      const config = readConfig()
      const agents = isRecord(config.agents) ? config.agents : {}
      const list = Array.isArray(agents.list) ? (agents.list as unknown[]) : []
      const agent = list.find(
        (a): a is Record<string, unknown> => isRecord(a) && a.id === agentId
      )
      if (!agent) return { ok: true, skills: null }
      const skills = Array.isArray(agent.skills) ? (agent.skills as string[]) : null
      return { ok: true, skills }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Set per-agent skill allowlist in openclaw.json
  // params.skills = null → remove field (all enabled)
  // params.skills = [] → no skills
  // params.skills = ['a','b'] → only those skills
  ipcMain.handle('openclaw:agent-skills:set', (
    _event,
    params: { agentId: string; skills: string[] | null }
  ) => {
    try {
      const config = readConfig()
      if (!isRecord(config.agents)) config.agents = {}
      const agentsObj = config.agents as Record<string, unknown>
      if (!Array.isArray(agentsObj.list)) agentsObj.list = []
      const list = agentsObj.list as Record<string, unknown>[]
      const idx = list.findIndex((a) => isRecord(a) && a.id === params.agentId)

      if (idx === -1) {
        // Agent not in config file yet — add minimal entry
        const entry: Record<string, unknown> = { id: params.agentId }
        if (params.skills !== null) entry.skills = params.skills
        list.push(entry)
      } else {
        if (params.skills === null) {
          delete list[idx].skills
        } else {
          list[idx] = { ...list[idx], skills: params.skills }
        }
      }

      writeConfig(config)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
