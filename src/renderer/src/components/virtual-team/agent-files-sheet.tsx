import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, FileText, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { getAgentAvatarUrl } from "@/lib/avatar"
import type { Agent } from "@/types"

type FileEntry = {
  name: string
  path: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
}

type View = { kind: "list" } | { kind: "editor"; file: FileEntry }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  if (m < 1) return "刚刚"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface AgentFilesSheetProps {
  agent: Agent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AgentFilesSheet({ agent, open, onOpenChange }: AgentFilesSheetProps) {
  const [view, setView] = useState<View>({ kind: "list" })
  const [files, setFiles] = useState<FileEntry[]>([])
  const [workspace, setWorkspace] = useState("")
  const [loadingList, setLoadingList] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editContent, setEditContent] = useState("")

  const loadFiles = useCallback(async () => {
    if (!agent) return
    setLoadingList(true)
    try {
      const res = await window.ipc.agentsFilesList({ agentId: agent.id })
      if (res.ok) {
        const r = res.result as { workspace?: string; files?: FileEntry[] }
        setWorkspace(r.workspace ?? "")
        setFiles(r.files ?? [])
      } else {
        toast.error((res as { error?: string }).error ?? "获取文件列表失败")
      }
    } finally {
      setLoadingList(false)
    }
  }, [agent])

  useEffect(() => {
    if (open && agent) {
      setView({ kind: "list" })
      loadFiles()
    }
  }, [open, agent, loadFiles])

  const openFile = async (file: FileEntry) => {
    if (file.missing) {
      setView({ kind: "editor", file })
      setEditContent("")
      return
    }
    if (!agent) return
    setLoadingFile(true)
    try {
      const res = await window.ipc.agentsFilesGet({ agentId: agent.id, name: file.name })
      if (res.ok) {
        const f = (res.result as { file?: FileEntry }).file
        const populated = { ...file, content: f?.content ?? "" }
        setView({ kind: "editor", file: populated })
        setEditContent(f?.content ?? "")
      } else {
        toast.error((res as { error?: string }).error ?? "读取文件失败")
      }
    } finally {
      setLoadingFile(false)
    }
  }

  const saveFile = async () => {
    if (view.kind !== "editor" || !agent) return
    setSaving(true)
    try {
      const res = await window.ipc.agentsFilesSet({
        agentId: agent.id,
        name: view.file.name,
        content: editContent,
      })
      if (res.ok) {
        toast.success(`${view.file.name} 已保存`)
        setView({ kind: "editor", file: { ...view.file, missing: false, content: editContent } })
        // refresh list in background
        loadFiles()
      } else {
        toast.error((res as { error?: string }).error ?? "保存失败")
      }
    } finally {
      setSaving(false)
    }
  }

  if (!agent) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            {view.kind === "editor" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setView({ kind: "list" })}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                {agent.avatar}
              </AvatarFallback>
              <AvatarImage src={getAgentAvatarUrl(agent.id)} />
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm leading-tight">{agent.name}</SheetTitle>
              {view.kind === "editor" ? (
                <p className="text-xs text-muted-foreground font-mono">{view.file.name}</p>
              ) : (
                workspace && (
                  <p className="text-xs text-muted-foreground truncate" title={workspace}>
                    {workspace}
                  </p>
                )
              )}
            </div>
            {view.kind === "editor" && (
              <Button size="sm" className="h-7 gap-1" onClick={saveFile} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                保存
              </Button>
            )}
          </div>
        </SheetHeader>

        {view.kind === "list" ? (
          <ScrollArea className="flex-1">
            {loadingList ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">加载中...</span>
              </div>
            ) : (
              <div className="divide-y">
                {files.map((file) => (
                  <button
                    key={file.name}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => openFile(file)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.missing
                          ? "缺失"
                          : [
                              file.size != null && formatSize(file.size),
                              file.updatedAtMs != null && formatTime(file.updatedAtMs),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </div>
                    {file.missing && (
                      <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500 shrink-0">
                        MISSING
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 p-3">
            {loadingFile ? (
              <div className="flex items-center justify-center flex-1 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">读取中...</span>
              </div>
            ) : (
              <Textarea
                className="flex-1 resize-none font-mono text-sm min-h-0"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder={`${view.file.name} 内容为空，输入后点击保存即可创建`}
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
