import type { IpcMain } from 'electron'
import { dialog } from 'electron'

export const registerDialogHandlers = (ipcMain: IpcMain): void => {
  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false }
    return { ok: true, path: result.filePaths[0] }
  })
}
