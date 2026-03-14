import type { IpcMain } from 'electron'
import { gw } from './gw'

export const registerCronHandlers = (ipcMain: IpcMain): void => {
  ipcMain.handle('cron:list', async () => {
    return gw('cron.list', {})
  })

  ipcMain.handle('cron:add', async (_event, params: unknown) => {
    return gw('cron.add', params)
  })

  ipcMain.handle('cron:update', async (_event, params: unknown) => {
    return gw('cron.update', params)
  })

  ipcMain.handle('cron:remove', async (_event, params: { jobId: string }) => {
    return gw('cron.remove', params)
  })

  ipcMain.handle('cron:run', async (_event, params: { jobId: string }) => {
    return gw('cron.run', params)
  })

  ipcMain.handle('cron:runs', async (_event, params: { jobId: string }) => {
    return gw('cron.runs', params)
  })

  ipcMain.handle('cron:status', async () => {
    return gw('cron.status', {})
  })
}
