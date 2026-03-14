

import { AtSign, Bold, File, ImageIcon, Maximize2, Paperclip, Plus, RotateCcw, Scissors, Send, Smile, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import type { ChatAttachment } from "@/types"

interface MessageInputProps {
  onSend: (content: string, attachments?: ChatAttachment[]) => void
  onNewSession?: () => void
  showMention?: boolean
  members?: { id: string; name: string }[]
  onMention?: (memberId: string) => void
}

const emojis = ["😀", "😂", "😍", "🤔", "👍", "👌", "🙏", "🎉", "❤️", "🚀", "💡", "🔥", "✅", "🎯", "📝", "⚡", "💪", "🤝"]

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

let attachmentCounter = 0
function generateAttachmentId(): string {
  return `att-${Date.now()}-${(++attachmentCounter).toString(36)}`
}

export function MessageInput({ onSend, onNewSession, showMention, members }: MessageInputProps) {
  const { t } = useI18n()
  const [content, setContent] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [showMentionPopover, setShowMentionPopover] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasContent = content.trim().length > 0 || attachments.length > 0

  const handleUnavailableAction = (actionLabel: string) => {
    toast.info(t("header.unavailableAction", { action: actionLabel }))
  }

  // ── Shared file processing ───────────────────────────────────────────────────
  const processFile = useCallback((file: File) => {
    if (file.type.startsWith("image/")) {
      // 图片：base64 编码后作为视觉附件发送
      if (file.size > MAX_IMAGE_SIZE) {
        toast.error(t("messageInput.imageTooLarge"))
        return
      }
      const reader = new FileReader()
      reader.addEventListener("load", () => {
        const dataUrl = reader.result as string
        setAttachments((prev) => [...prev, {
          id: generateAttachmentId(),
          dataUrl,
          mimeType: file.type,
          fileName: file.name || undefined,
        }])
      })
      reader.readAsDataURL(file)
    } else {
      // 非图片：用 webUtils.getPathForFile（Electron 32+ API，由 preload 暴露）
      const filePath = window.ipc.getFilePath(file)
      if (!filePath) {
        toast.error(t("messageInput.filePathUnavailable"))
        return
      }
      setAttachments((prev) => [...prev, {
        id: generateAttachmentId(),
        filePath,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || filePath.split(/[/\\]/).pop(),
      }])
    }
  }, [t])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [content])

  const handleSend = useCallback(() => {
    if (!hasContent) return
    onSend(content.trim(), attachments.length > 0 ? attachments : undefined)
    setContent("")
    setAttachments([])
  }, [content, attachments, hasContent, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }

    if (e.key === "Backspace" && members?.length) {
      const el = textareaRef.current
      if (!el) return
      const pos = el.selectionStart
      // 有选区时让浏览器默认处理
      if (pos !== el.selectionEnd) return
      const textBefore = content.slice(0, pos)
      // 检查光标前是否紧跟一个完整的 @member 或 @member（含尾部空格）
      for (const m of members) {
        const withSpace = `@${m.name} `
        const bare = `@${m.name}`
        const matched = textBefore.endsWith(withSpace)
          ? withSpace
          : textBefore.endsWith(bare)
            ? bare
            : null
        if (matched) {
          e.preventDefault()
          const newPos = pos - matched.length
          const newContent = content.slice(0, newPos) + content.slice(pos)
          setContent(newContent)
          // 恢复光标位置（setState 异步，需等渲染后设置）
          requestAnimationFrame(() => {
            el.selectionStart = newPos
            el.selectionEnd = newPos
          })
          return
        }
      }
    }

    if (e.key === "@" && showMention && members?.length) {
      setShowMentionPopover(true)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)
    if (value.endsWith("@") && showMention && members?.length) {
      setShowMentionPopover(true)
    } else {
      setShowMentionPopover(false)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems: DataTransferItem[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith("image/")) {
        imageItems.push(item)
      }
    }

    if (imageItems.length === 0) return

    e.preventDefault()

    for (const item of imageItems) {
      const file = item.getAsFile()
      if (!file) continue
      processFile(file)
    }
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      processFile(files[i])
    }

    // Reset so same file can be selected again
    e.target.value = ""
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    // relatedTarget 不在容器内时才视为真正离开（进入子元素不触发）
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      processFile(files[i])
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id))
  }

  const insertMention = (name: string) => {
    setContent((prev) => {
      const lastAt = prev.lastIndexOf("@")
      return lastAt >= 0 ? prev.slice(0, lastAt) + `@${name} ` : prev + `@${name} `
    })
    setShowMentionPopover(false)
    textareaRef.current?.focus()
  }

  const insertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji)
    textareaRef.current?.focus()
  }

  const triggerMention = () => {
    if (showMention && members?.length) {
      setContent((prev) => prev + "@")
      setShowMentionPopover(true)
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      className="border-t bg-background relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-b-md border-2 border-dashed border-primary bg-primary/5 pointer-events-none">
          <ImageIcon className="h-8 w-8 text-primary/60" />
          <span className="text-sm text-primary/80 font-medium">{t("messageInput.dropToAttach")}</span>
        </div>
      )}

      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex gap-2 flex-wrap">
          {attachments.map((att) => (
            <div key={att.id} className="relative group">
              {att.dataUrl ? (
                // 图片缩略图
                <>
                  <img
                    src={att.dataUrl}
                    alt={att.fileName ?? "attachment preview"}
                    className="h-16 w-16 rounded-md object-cover border border-border"
                  />
                  {att.fileName && (
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md">
                      <p className="text-[9px] text-white truncate leading-tight">{att.fileName}</p>
                    </div>
                  )}
                </>
              ) : (
                // 非图片文件 chip
                <div className="flex items-center gap-1.5 h-16 pl-2.5 pr-7 rounded-md border border-border bg-muted/60 max-w-[160px]">
                  <File className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-foreground truncate leading-tight">{att.fileName}</span>
                </div>
              )}
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeAttachment(att.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div className="px-4 pt-3 pb-1">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            attachments.length > 0
              ? t("messageInput.placeholders.withAttachments")
              : t("messageInput.placeholders.default")
          }
          onBlur={() => setShowMentionPopover(false)}
          className="w-full resize-none border-0 bg-transparent px-0 py-1 text-sm leading-5 focus:outline-none placeholder:text-muted-foreground/50 min-h-[36px] max-h-[200px] overflow-y-auto"
          rows={1}
        />
      </div>

      {/* Hidden file input — accepts all files; images go as base64, others via local path */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<Bold className="h-4 w-4" />}
            tooltip={t("messageInput.toolbar.format")}
            unavailable
            onClick={() => handleUnavailableAction(t("messageInput.toolbar.format"))}
          />

          <Popover>
            <PopoverTrigger
              render={<button type="button" className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors" />}
            >
              <Smile className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start" side="top">
              <div className="grid grid-cols-6 gap-1">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    className="text-xl p-1.5 rounded hover:bg-accent transition-colors"
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {showMention && (
            <ToolbarButton icon={<AtSign className="h-4 w-4" />} tooltip={t("messageInput.toolbar.mention")} onClick={triggerMention} />
          )}

          {/* @提及下拉列表：绝对定位，锚在输入区左下角正上方 */}
          {showMention && showMentionPopover && members && members.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-48 bg-popover border border-border rounded-md shadow-md p-1 z-50">
              {members.map((m) => (
                <button
                  key={m.id}
                  className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                  onMouseDown={(e) => {
                    // 阻止 blur 导致 popover 提前关闭
                    e.preventDefault()
                    insertMention(m.name)
                  }}
                >
                  @{m.name}
                </button>
              ))}
            </div>
          )}

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarButton
            icon={<Scissors className="h-4 w-4" />}
            tooltip={t("messageInput.toolbar.shortcut")}
            unavailable
            onClick={() => handleUnavailableAction(t("messageInput.toolbar.shortcut"))}
          />
          <ToolbarButton icon={<Paperclip className="h-4 w-4" />} tooltip={t("messageInput.toolbar.attachment")} onClick={handleFileSelect} />
          <ToolbarButton
            icon={<Plus className="h-4 w-4" />}
            tooltip={t("messageInput.toolbar.more")}
            unavailable
            onClick={() => handleUnavailableAction(t("messageInput.toolbar.more"))}
          />

          {onNewSession && (
            <>
              <div className="w-px h-4 bg-border mx-1" />
              <ToolbarButton icon={<RotateCcw className="h-4 w-4" />} tooltip={t("messageInput.toolbar.newSession")} onClick={onNewSession} />
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<Maximize2 className="h-3.5 w-3.5" />}
            tooltip={t("messageInput.toolbar.expand")}
            unavailable
            onClick={() => handleUnavailableAction(t("messageInput.toolbar.expand"))}
          />

          <Button
            size="sm"
            className={cn(
              "h-7 px-3 rounded-md gap-1 text-xs font-medium transition-colors",
              hasContent
                ? "bg-[#3370ff] hover:bg-[#2860e0] text-white"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            onClick={handleSend}
            disabled={!hasContent}
          >
            <Send className="h-3.5 w-3.5" />
            {t("messageInput.toolbar.send")}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({
  icon,
  tooltip,
  onClick,
  unavailable = false,
}: {
  icon: React.ReactNode
  tooltip: string
  onClick?: () => void
  unavailable?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-disabled={unavailable}
            className={cn(
              "inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground transition-colors",
              unavailable
                ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={onClick}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
