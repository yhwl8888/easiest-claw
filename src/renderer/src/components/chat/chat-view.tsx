
import { ConversationList } from "./conversation-list"
import { ChatWindow } from "./chat-window"

export function ChatView() {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 左侧对话列表 */}
      <div className="shrink-0 w-[280px] flex flex-col overflow-hidden border-r bg-muted/30">
        <ConversationList />
      </div>

      {/* 右侧聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatWindow />
      </div>
    </div>
  )
}
