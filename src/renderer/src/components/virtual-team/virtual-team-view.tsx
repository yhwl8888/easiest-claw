import { useState } from "react"
import {
  FolderOpen,
  MessagesSquare,
  Trash2,
  Users,
  Zap,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { getAgentAvatarUrl } from "@/lib/avatar"
import { getStrategyLabel } from "@/lib/orchestration/labels"
import { cn } from "@/lib/utils"
import { useApp } from "@/store/app-context"
import type { Conversation } from "@/types"

const strategyColors: Record<string, string> = {
  coordinator: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  "skill-match": "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
  "round-robin": "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
  all: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
}

interface GroupCardProps {
  group: Conversation
  agentMap: Record<string, { name: string; avatar: string; role: string }>
  onOpen: (id: string) => void
  onDissolve: (id: string) => void
}

function GroupCard({ group, agentMap, onOpen, onDissolve }: GroupCardProps) {
  const { t } = useI18n()
  const strategy = group.orchestration?.strategy ?? "all"
  const strategyLabel = getStrategyLabel(strategy, t)
  const strategyColor = strategyColors[strategy] ?? strategyColors.all

  // 成员中排除 "user"，只展示 Agent 头像，最多显示 5 个
  const agentMembers = group.members.filter((m) => m !== "user")
  const displayMembers = agentMembers.slice(0, 5)
  const extraCount = agentMembers.length - displayMembers.length

  const coordinatorId = group.orchestration?.coordinatorId
  const coordinator = coordinatorId ? agentMap[coordinatorId] : null

  return (
    <Card
      className="p-5 flex flex-col gap-4 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onOpen(group.id)}
    >
      {/* 顶部：头像 + 名称 + 未读角标 */}
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 select-none">
          {group.avatar || "👥"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{group.name}</p>
            {group.unreadCount > 0 && (
              <span className="shrink-0 h-4.5 min-w-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {group.unreadCount > 99 ? "99+" : group.unreadCount}
              </span>
            )}
          </div>
          {group.purpose && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{group.purpose}</p>
          )}
        </div>
      </div>

      {/* 成员头像堆叠 */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {displayMembers.map((memberId) => {
            const agent = agentMap[memberId]
            return (
              <Tooltip key={memberId}>
                <TooltipTrigger>
                  <Avatar className={cn(
                    "h-6 w-6 ring-2 ring-background",
                    coordinatorId === memberId && "ring-primary"
                  )}>
                    <AvatarImage src={getAgentAvatarUrl(memberId)} />
                    <AvatarFallback className="text-[9px] bg-muted">
                      {agent?.name?.slice(0, 1) ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {agent?.name ?? memberId}
                  {coordinatorId === memberId && " (协调人)"}
                </TooltipContent>
              </Tooltip>
            )
          })}
          {extraCount > 0 && (
            <div className="h-6 w-6 ring-2 ring-background rounded-full bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
              +{extraCount}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{agentMembers.length} 位成员</span>
      </div>

      {/* 策略 + 协调人 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className={cn("text-[11px] font-normal px-2 py-0.5", strategyColor)}>
          <Zap className="h-2.5 w-2.5 mr-1" />
          {strategyLabel}
        </Badge>
        {coordinator && strategy === "coordinator" && (
          <span className="text-[11px] text-muted-foreground">
            协调人: {coordinator.name}
          </span>
        )}
      </div>

      {/* 工作区路径 */}
      {group.workspacePath && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 font-mono">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{group.workspacePath}</span>
        </div>
      )}

      {/* 最近消息 */}
      {group.lastMessage && (
        <div className="flex items-center justify-between gap-2 border-t pt-3 mt-auto">
          <p className="text-xs text-muted-foreground truncate">
            {group.lastMessageSender && (
              <span className="font-medium text-foreground/70">{group.lastMessageSender}: </span>
            )}
            {group.lastMessage}
          </p>
          {group.lastMessageTime && (
            <span className="text-[10px] text-muted-foreground/60 shrink-0">{group.lastMessageTime}</span>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => onOpen(group.id)}
        >
          <MessagesSquare className="h-3.5 w-3.5 mr-1.5" />
          进入群聊
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:border-destructive"
                onClick={() => onDissolve(group.id)}
              />
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent>解散群组</TooltipContent>
        </Tooltip>
      </div>
    </Card>
  )
}

export function VirtualTeamView() {
  const { state, dispatch } = useApp()
  const [dissolveTarget, setDissolveTarget] = useState<string | null>(null)

  const groups = state.conversations.filter((c) => c.type === "group")

  // 建立 agentId → {name, avatar, role} 映射，方便卡片查询
  const agentMap = Object.fromEntries(
    state.agents.map((a) => [a.id, { name: a.name, avatar: a.avatar, role: a.role }])
  )

  const handleOpen = (groupId: string) => {
    dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: groupId })
    dispatch({ type: "SET_VIEW", payload: "chat" })
  }

  const handleDissolveConfirm = () => {
    if (!dissolveTarget) return
    dispatch({ type: "DISSOLVE_GROUP", payload: { conversationId: dissolveTarget } })
    setDissolveTarget(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
      {/* 页头 */}
      <div
        className="shrink-0 flex items-center px-8 py-5 border-b bg-background"
        style={{
          WebkitAppRegion: "drag",
          ...(window.ipc.platform !== "darwin" ? { paddingRight: "154px" } : {}),
        } as React.CSSProperties}
      >
        <div
          className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="ml-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <h1 className="text-lg font-semibold">虚拟团队</h1>
          <p className="text-xs text-muted-foreground">
            {groups.length > 0 ? `${groups.length} 个群组` : "管理你的 Agent 协作群组"}
          </p>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {groups.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center text-4xl">
              👥
            </div>
            <div>
              <p className="font-semibold text-foreground">还没有群组</p>
              <p className="text-sm text-muted-foreground mt-1">
                点击左侧栏的 <span className="font-medium text-foreground">+</span> 按钮创建群组
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                agentMap={agentMap}
                onOpen={handleOpen}
                onDissolve={setDissolveTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* 解散确认 */}
      <AlertDialog open={!!dissolveTarget} onOpenChange={(o) => !o && setDissolveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解散群组</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除群组及所有聊天记录，无法撤销。确认解散吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDissolveConfirm}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              解散
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
