import { useEffect, useRef, useState } from "react"
import { Loader2, Wifi, Minus, X } from "lucide-react"
import { Camera } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { markOnboardingDone, setUserAvatar, setUserName } from "@/lib/avatar"
import { useI18n } from "@/i18n"
import { useApp } from "@/store/app-context"
import logoSvg from "@/assets/logo.svg"

// ── Preset avatars ─────────────────────────────────────────────────────────────

const PRESETS = [
  { emoji: "🦊", bg: "#f97316" },
  { emoji: "🐼", bg: "#6b7280" },
  { emoji: "🦁", bg: "#eab308" },
  { emoji: "🐸", bg: "#22c55e" },
  { emoji: "🦄", bg: "#a855f7" },
  { emoji: "🐺", bg: "#3b82f6" },
  { emoji: "🦋", bg: "#ec4899" },
  { emoji: "🐬", bg: "#06b6d4" },
  { emoji: "🦅", bg: "#dc2626" },
  { emoji: "🐉", bg: "#7c3aed" },
]

function emojiToDataUrl(emoji: string, bg: string): string {
  try {
    const size = 150
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `${size * 0.52}px serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.04)
    return canvas.toDataURL("image/png")
  } catch {
    return ""
  }
}

// ── Step 1: Gateway loading screen ────────────────────────────────────────────

function GatewayLoadingStep() {
  const { t } = useI18n()
  const { state } = useApp()
  const status = (state as { connectionStatus?: string }).connectionStatus ?? "connecting"

  const isConnecting = status === "connecting"
  const isReady = status === "connected"

  // 解压进度本地状态（仅在此 step 生命周期内有效）
  const [extractPercent, setExtractPercent] = useState<number | null>(null)
  const [extractLog, setExtractLog] = useState<string[]>([])
  const [gatewayLog, setGatewayLog] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const gwLogRef = useRef<HTMLDivElement>(null)
  const isExtracting = extractPercent !== null && extractPercent < 100

  useEffect(() => {
    // 解压进度
    const unsubExtract = window.ipc.onExtractProgress(({ percent, file }) => {
      setExtractPercent(percent)
      if (file) {
        setExtractLog(prev => {
          const next = [...prev, file]
          return next.length > 200 ? next.slice(-200) : next
        })
      }
    })
    // gateway 启动日志
    const unsubGwLog = window.ipc.onGatewayLog(({ line }) => {
      setGatewayLog(prev => {
        const next = [...prev, line]
        return next.length > 200 ? next.slice(-200) : next
      })
    })
    // 补偿：渲染进程挂载前已开始解压时，主动查询当前状态
    window.ipc.extractStatus().then(({ phase, percent }) => {
      if (phase === 'extracting') setExtractPercent(percent)
      else if (phase === 'done' || phase === 'skipped') setExtractPercent(100)
    }).catch(() => { /* ignore */ })
    return () => { unsubExtract(); unsubGwLog() }
  }, [])

  // 解压日志自动滚到底部
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [extractLog])

  // gateway 日志自动滚到底部
  useEffect(() => {
    if (gwLogRef.current) gwLogRef.current.scrollTop = gwLogRef.current.scrollHeight
  }, [gatewayLog])

  return (
    <div className="flex flex-col items-center justify-center gap-6 text-center">
      <img src={logoSvg} alt="EasiestClaw" className="h-16 w-auto" />

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">EasiestClaw</h1>
      </div>

      {isExtracting ? (
        // ── 解压进度 ──────────────────────────────────────────────────────────
        <div className="flex flex-col items-center gap-3 w-[560px]">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm font-medium text-foreground">{t("onboarding.extracting")}</p>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${extractPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{extractPercent}%</p>
          {extractLog.length > 0 && (
            <div className="relative w-full" style={{ height: '13rem' }}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-6 z-10 bg-gradient-to-b from-background to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 z-10 bg-gradient-to-t from-background to-transparent" />
              <div
                ref={logRef}
                className="h-full overflow-y-auto text-left"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
              >
                {extractLog.map((line, i) => (
                  <div key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed truncate">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // ── Gateway 连接状态 ───────────────────────────────────────────────────
        <div className="flex flex-col items-center gap-3 w-[560px]">
          {isReady ? (
            <Wifi className="h-8 w-8 text-green-500 animate-pulse" />
          ) : (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          )}
          <p className="text-sm font-medium text-foreground">
            {isReady
              ? t("onboarding.gatewayReady")
              : isConnecting
                ? t("onboarding.gatewayConnecting")
                : t("onboarding.gatewayStarting")}
          </p>
          {!isReady && (
            <p className="text-xs text-muted-foreground max-w-xs">
              {t("onboarding.gatewayStartingDesc")}
            </p>
          )}
          {gatewayLog.length > 0 && (
            <div className="relative w-full" style={{ height: '13rem' }}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-6 z-10 bg-gradient-to-b from-background to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 z-10 bg-gradient-to-t from-background to-transparent" />
              <div
                ref={gwLogRef}
                className="h-full overflow-y-auto text-left"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
              >
                {gatewayLog.map((line, i) => (
                  <div key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed truncate">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 2: Profile setup ──────────────────────────────────────────────────────

function ProfileSetupStep({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const initial = name.trim().charAt(0).toUpperCase() || "?"

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error(t("header.selectImageFile"))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("header.imageSizeLimit"))
      return
    }
    setUploading(true)
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error("read failed"))
        reader.readAsDataURL(file)
      })
      setAvatarUrl(url)
      setSelectedPreset(null)
    } catch {
      toast.error(t("header.networkError"))
    } finally {
      setUploading(false)
    }
  }

  const handlePresetClick = (index: number) => {
    const preset = PRESETS[index]
    setAvatarUrl(emojiToDataUrl(preset.emoji, preset.bg))
    setSelectedPreset(index)
  }

  const handleDone = () => {
    if (!name.trim()) {
      toast.error(t("onboarding.nameRequired"))
      return
    }
    if (avatarUrl) setUserAvatar(avatarUrl)
    setUserName(name.trim())
    markOnboardingDone()
    onDone()
  }

  const handleSkip = () => {
    markOnboardingDone()
    onDone()
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="text-3xl mb-2">👋</div>
        <h2 className="text-lg font-semibold">{t("onboarding.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("onboarding.subtitle")}</p>
      </div>

      {/* Avatar section */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("onboarding.avatarSectionTitle")}
        </p>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : initial}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePresetClick(i)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center text-lg transition-all hover:scale-110",
                  selectedPreset === i
                    ? "ring-2 ring-offset-1 ring-primary scale-110"
                    : "opacity-80 hover:opacity-100"
                )}
                style={{ backgroundColor: preset.bg }}
              >
                {preset.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Name section */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("onboarding.nameSectionTitle")}
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("onboarding.namePlaceholder")}
          maxLength={30}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleDone() }}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <Button
          className="w-full"
          onClick={handleDone}
          disabled={!name.trim() || uploading}
        >
          {t("onboarding.getStarted")}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          onClick={handleSkip}
        >
          {t("onboarding.skip")}
        </button>
      </div>
    </div>
  )
}

// ── GatewayLoadingScreen（老用户启动时全屏 loading）──────────────────────────
// 与 OnboardingFlow 共用 GatewayLoadingStep，但跳过 profile setup 直接进主界面。

export function GatewayLoadingScreen() {
  return (
    <div className="h-screen relative flex items-center justify-center bg-background">
      <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
        <button
          type="button"
          onClick={() => window.ipc.windowMinimize()}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => window.ipc.windowClose()}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <GatewayLoadingStep />
    </div>
  )
}

interface OnboardingFlowProps {
  onDone: () => void
}

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const { state } = useApp()
  const [step, setStep] = useState<"gateway" | "profile">("gateway")

  useEffect(() => {
    if (!state.gatewayConnected || step !== "gateway") return
    const timer = setTimeout(() => setStep("profile"), 600)
    return () => clearTimeout(timer)
  }, [state.gatewayConnected, step])

  return (
    <div className="h-screen relative flex items-center justify-center bg-background">
      {/* 窗口控件 — 始终可见 */}
      <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
        <button
          type="button"
          onClick={() => window.ipc.windowMinimize()}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => window.ipc.windowClose()}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className={cn(
        "transition-all duration-300",
        step === "gateway" ? "opacity-100" : "opacity-0 pointer-events-none absolute"
      )}>
        <GatewayLoadingStep />
      </div>
      <div className={cn(
        "transition-all duration-300 px-6",
        step === "profile" ? "opacity-100" : "opacity-0 pointer-events-none absolute"
      )}>
        {step === "profile" && <ProfileSetupStep onDone={onDone} />}
      </div>
    </div>
  )
}
