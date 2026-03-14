export interface SlashCommandDef {
  name: string
  description: string
  args?: string
  executeLocal?: boolean
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: 'new', description: '开始新对话（清空当前上下文）', executeLocal: true },
  { name: 'compact', description: '压缩对话历史，节省 token' },
  { name: 'stop', description: '停止当前生成' },
  { name: 'clear', description: '清除屏幕上的消息' },
  { name: 'think', description: '设置思考强度', args: 'none|low|medium|high' },
  { name: 'model', description: '切换当前使用的模型', args: '<model-id>' },
  { name: 'verbose', description: '切换详细输出模式' },
  { name: 'status', description: '查看当前运行状态' },
  { name: 'help', description: '查看所有可用命令' },
]

export function getSlashCommandCompletions(filter: string): SlashCommandDef[] {
  if (!filter) return SLASH_COMMANDS
  const lower = filter.toLowerCase()
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(lower))
}

export function parseSlashCommand(content: string): { command: SlashCommandDef; args: string } | null {
  if (!content.startsWith('/')) return null
  const withoutSlash = content.slice(1)
  const spaceIdx = withoutSlash.indexOf(' ')
  const commandName = spaceIdx >= 0 ? withoutSlash.slice(0, spaceIdx) : withoutSlash
  const args = spaceIdx >= 0 ? withoutSlash.slice(spaceIdx + 1) : ''
  const command = SLASH_COMMANDS.find((c) => c.name === commandName.toLowerCase())
  if (!command) return null
  return { command, args }
}
