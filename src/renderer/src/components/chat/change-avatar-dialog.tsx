

import { Loader2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getAgentAvatarUrl, setAgentAvatar } from "@/lib/avatar"
import { useI18n } from "@/i18n"

export function ChangeAvatarDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  agentName: string
}) {
  const { t } = useI18n()
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentAvatar = getAgentAvatarUrl(agentId)
  const previewUrl = uploadPreview ?? currentAvatar

  const initials = (agentName ?? "A").slice(0, 2).toUpperCase()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError(t("header.selectImageFile"))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t("header.imageSizeLimit"))
      return
    }

    setError(null)
    setUploadFile(file)

    const reader = new FileReader()
    reader.onload = () => setUploadPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleConfirm = async () => {
    if (!uploadFile) return

    setLoading(true)
    setError(null)

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("Failed to read file"))
        reader.readAsDataURL(uploadFile)
      })
      setAgentAvatar(agentId, dataUrl)
      toast.success(t("header.avatarUpdated"))
      onOpenChange(false)
    } catch {
      setError(t("header.networkError"))
    } finally {
      setLoading(false)
    }
  }

  const resetState = () => {
    setUploadPreview(null)
    setUploadFile(null)
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (loading) return
        onOpenChange(v)
        if (!v) resetState()
      }}
    >
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t("header.changeAvatarTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Preview */}
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-border flex items-center justify-center bg-muted">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={t("header.preview")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl font-semibold text-muted-foreground select-none">
                  {initials}
                </span>
              )}
            </div>
          </div>

          {/* Upload */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              <Upload className="h-4 w-4" />
              {uploadFile ? uploadFile.name : t("header.clickToUpload")}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              {t("header.uploadSupport")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!uploadFile || loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {loading ? t("common.saving") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
