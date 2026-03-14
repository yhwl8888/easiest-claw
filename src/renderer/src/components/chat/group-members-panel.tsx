

import { Crown, MessageSquare, UserPlus } from "lucide-react"
import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useI18n } from "@/i18n"
import { getAgentAvatarUrl, getUserAvatarUrl, useAvatarVersion } from "@/lib/avatar"
import { getStrategyLabel } from "@/lib/orchestration/labels"
import { cn } from "@/lib/utils"
import { useApp } from "@/store/app-context"
import type { Conversation } from "@/types"

interface GroupMembersPanelProps {
  conversation: Conversation
  open: boolean
  onOpenChange: (open: boolean) => void
}

const statusColors: Record<string, string> = {
  idle: "bg-green-500",
  working: "bg-yellow-500",
  busy: "bg-red-500",
  chatting: "bg-yellow-500",
  thinking: "bg-yellow-500",
  completed: "bg-green-500",
}

export function GroupMembersPanel({ conversation, open, onOpenChange }: GroupMembersPanelProps) {
  const { dispatch, state } = useApp()
  const { t } = useI18n()
  useAvatarVersion()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const memberIds = conversation.members
  const hasUser = memberIds.includes("user")
  const agentMembers = state.agents.filter((a) => memberIds.includes(a.id))
  const orchestration = conversation.orchestration
  const coordinatorId = orchestration?.coordinatorId

  const handleStartChat = (agentId: string) => {
    const existing = state.conversations.find(
      (c) => c.type === "direct" && c.members.includes(agentId)
    )
    if (existing) {
      dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: existing.id })
    }
  }

  const totalCount = (hasUser ? 1 : 0) + agentMembers.length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[280px] sm:w-[280px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="text-base">
            {t("groupMembers.title", { count: totalCount })}
          </SheetTitle>
          {orchestration && orchestration.strategy !== "all" && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[11px] text-muted-foreground">{t("groupMembers.collaborationMode")}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {getStrategyLabel(orchestration.strategy, t)}
              </Badge>
            </div>
          )}
          {orchestration?.strategy === "skill-match" && orchestration.maxResponders && (
            <p className="text-[11px] text-muted-foreground">
              {t("groupMembers.maxResponders", { count: orchestration.maxResponders })}
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {hasUser && (
              <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={getUserAvatarUrl()} alt={t("common.meHuman")} />
                    <AvatarFallback className="text-xs bg-green-100 text-green-700">
                      {t("common.meHuman")}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background", "bg-green-500")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t("common.meHuman")}</p>
                  <p className="text-xs text-muted-foreground truncate">{t("groupMembers.admin")}</p>
                </div>
              </div>
            )}
            {agentMembers.map((agent) => (
              <div key={agent.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={getAgentAvatarUrl(agent.id)} alt={agent.name} />
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                      {agent.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background", statusColors[agent.status] ?? "bg-gray-400")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    {coordinatorId === agent.id && (
                      <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleStartChat(agent.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setAddDialogOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            {t("groupMembers.addMembers")}
          </Button>
        </div>

        <AddMemberDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          conversation={conversation}
          currentMemberIds={memberIds}
          onAdd={(agentId) => {
            dispatch({ type: "ADD_GROUP_MEMBER", payload: { conversationId: conversation.id, agentId } })
            setAddDialogOpen(false)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  conversation,
  currentMemberIds,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: Conversation
  currentMemberIds: string[]
  onAdd: (agentId: string) => void
}) {
  const { state } = useApp()
  const { t } = useI18n()

  const available = state.agents.filter((a) => !currentMemberIds.includes(a.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{t("groupMembers.addMembers")}</DialogTitle>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("groupMembers.noAvailableMembers")}
          </p>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="space-y-1">
              {available.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onAdd(agent.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent text-left transition-colors"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={getAgentAvatarUrl(agent.id)} alt={agent.name} />
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                      {agent.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                  </div>
                  <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
