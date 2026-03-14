import type { Message } from "@/types"
import type { AppState, AppAction } from "../app-types"
import { extractTextContent, extractImageAttachments, uniqueId } from "../app-utils"
import { saveAttachmentCache, popAttachmentCache } from "../app-storage"
import { handleGatewayEvent } from "./gateway-event"

export function handleChatAction(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "SEND_MESSAGE": {
      const { conversationId, content, attachments } = action.payload
      // OpenClaw 的 chat.history 有 128KB 单消息上限，会剥离大图片
      // 发消息时将图片附件缓存到 localStorage，待历史加载时恢复
      const imageAtts = (attachments ?? []).filter((a) => !!a.dataUrl)
      if (imageAtts.length > 0) {
        saveAttachmentCache(conversationId, content, imageAtts)
      }
      const newMsg: Message = {
        id: uniqueId("msg"),
        conversationId,
        senderId: "user",
        senderName: "\u6211",
        senderAvatar: "ZK",
        content,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        read: true,
        type: "text",
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      }
      const existing = state.messages[conversationId] ?? []
      const updatedConvs = state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: content, lastMessageTime: newMsg.timestamp }
          : c
      )
      return {
        ...state,
        messages: { ...state.messages, [conversationId]: [...existing, newMsg] },
        conversations: updatedConvs,
      }
    }
    case "ADD_AGENT_MESSAGE": {
      const msg = action.payload
      const existing = state.messages[msg.conversationId] ?? []
      const updatedConvs = state.conversations.map((c) =>
        c.id === msg.conversationId
          ? {
              ...c,
              lastMessage: msg.content.slice(0, 100),
              lastMessageSender: msg.senderName,
              lastMessageTime: msg.timestamp,
              unreadCount:
                state.activeConversationId === msg.conversationId
                  ? 0
                  : c.unreadCount + 1,
            }
          : c
      )
      return {
        ...state,
        messages: { ...state.messages, [msg.conversationId]: [...existing, msg] },
        conversations: updatedConvs,
      }
    }
    case "SET_THINKING": {
      const next = new Set(state.thinkingAgents)
      if (action.payload.thinking) {
        next.add(action.payload.agentId)
      } else {
        next.delete(action.payload.agentId)
      }
      return { ...state, thinkingAgents: next }
    }
    case "APPEND_STREAMING_CONTENT": {
      const { conversationId, messageId, delta } = action.payload
      const existing = state.messages[conversationId] ?? []
      const idx = existing.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const updatedMsg = { ...existing[idx], content: existing[idx].content + delta }
      const updatedMsgs = [...existing]
      updatedMsgs[idx] = updatedMsg
      return {
        ...state,
        messages: { ...state.messages, [conversationId]: updatedMsgs },
      }
    }
    case "LOAD_HISTORY": {
      const { conversationId, agentId, messages: historyMessages } = action.payload
      const agent = state.agents.find((a) => a.id === agentId)
      const isInternalMessage = (content: string) =>
        content.startsWith("A new session was started via") ||
        content.startsWith("Execute your Session Startup") ||
        content.startsWith("I'll read the required session startup")

      const converted: Message[] = historyMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const isUser = m.role === "user"
          const content = extractTextContent(m.content)
          // 先尝试从 OpenClaw 历史消息中提取图片（小图片可能原样返回）
          // 若提取为空，则从 localStorage 缓存中恢复（OpenClaw 超限剥离的情况）
          const extractedAtts = isUser ? extractImageAttachments(m.content) : []
          const attachments = extractedAtts.length > 0
            ? extractedAtts
            : (isUser ? popAttachmentCache(conversationId, content) : [])
          const ts = m.timestamp
            ? new Date(m.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
            : ""
          return {
            id: uniqueId("hist"),
            conversationId,
            senderId: isUser ? "user" : agentId,
            senderName: isUser ? "\u6211" : (agent?.name ?? agentId),
            senderAvatar: isUser ? "ZK" : (agent?.avatar ?? agentId.slice(0, 2).toUpperCase()),
            senderRole: isUser ? undefined : agent?.role,
            content,
            timestamp: ts,
            read: true,
            type: "text" as const,
            ...(attachments.length > 0 ? { attachments } : {}),
          }
        })
        .filter((m) => (m.content.trim() || (m.attachments && m.attachments.length > 0)) && !isInternalMessage(m.content.trim()))

      if (converted.length === 0) return state

      // Keep any in-progress streaming messages that arrived via SSE
      const existing = state.messages[conversationId] ?? []
      const streamingMsgs = existing.filter((m) => m.id.startsWith("streaming-"))

      const lastMsg = converted[converted.length - 1]
      const updatedConvs = state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: lastMsg.content.slice(0, 100), lastMessageTime: lastMsg.timestamp }
          : c
      )
      return {
        ...state,
        messages: { ...state.messages, [conversationId]: [...converted, ...streamingMsgs] },
        conversations: updatedConvs,
      }
    }
    case "GATEWAY_EVENT":
      return handleGatewayEvent(state, action.payload)
    default:
      return null
  }
}
