import type { Agent, Conversation, ViewType, ChatAttachment } from "@/types"
import type { AgentSeed } from "@/hooks/use-openclaw"

export const extractTextContent = (content: unknown): string => {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object") {
          const rec = part as Record<string, unknown>
          if (rec.type === "text" && typeof rec.text === "string") return rec.text
        }
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  return ""
}

/**
 * 从 OpenClaw 历史消息 content 数组中提取图片块，转为 ChatAttachment。
 * 格式：[{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }]
 */
export const extractImageAttachments = (content: unknown): ChatAttachment[] => {
  if (!Array.isArray(content)) return []
  const results: ChatAttachment[] = []
  for (const part of content) {
    if (!part || typeof part !== "object") continue
    const rec = part as Record<string, unknown>
    if (rec.type !== "image") continue
    const source = rec.source as Record<string, unknown> | undefined
    if (!source || source.type !== "base64") continue
    const mediaType = typeof source.media_type === "string" ? source.media_type : ""
    const data = typeof source.data === "string" ? source.data : ""
    if (!mediaType || !data) continue
    results.push({
      id: uniqueId("hist-img"),
      dataUrl: `data:${mediaType};base64,${data}`,
      mimeType: mediaType,
    })
  }
  return results
}

// Strip the generated hex prefix (e.g. "850cf703-bbb" → "bbb") for agents
// created before the agents.update rename was introduced.
const stripHexPrefix = (raw: string): string =>
  /^[0-9a-f]{8}-(.+)$/i.exec(raw)?.[1] ?? raw

export const agentSeedToAgent = (seed: AgentSeed): Agent => {
  const name = stripHexPrefix(seed.name || seed.agentId)
  return {
    id: seed.agentId,
    name,
    role: "Agent",
    avatar: seed.emoji || name.slice(0, 2).toUpperCase(),
    emoji: seed.emoji,
    skills: [],
    category: "OpenClaw",
    status: "idle",
    lastActiveAt: "",
  }
}

export const agentSeedToConversation = (seed: AgentSeed): Conversation => {
  const name = stripHexPrefix(seed.name || seed.agentId)
  return {
    id: `conv-${seed.agentId}`,
    type: "direct",
    name,
    avatar: seed.emoji || name.slice(0, 2).toUpperCase(),
    members: [seed.agentId],
    lastMessage: "",
    lastMessageTime: "",
    unreadCount: 0,
  }
}

let _idCounter = 0
export const uniqueId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${(++_idCounter).toString(36)}`

export const VALID_VIEWS: ViewType[] = ["chat", "virtual-team", "cron", "openclaw", "skills", "agent-config"]

export const parseViewFromHash = (): ViewType => {
  if (typeof window === "undefined") return "chat"
  const hash = window.location.hash.replace("#", "")
  return VALID_VIEWS.includes(hash as ViewType) ? (hash as ViewType) : "chat"
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value))

export const resolveAgentIdFromPayload = (payload: Record<string, unknown>): string | null => {
  if (typeof payload.agentId === "string" && payload.agentId.trim()) {
    return payload.agentId.trim()
  }
  if (typeof payload.sessionKey === "string") {
    const match = payload.sessionKey.match(/^agent:([^:]+):/)
    if (match) return match[1]
  }
  return null
}
