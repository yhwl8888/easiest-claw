
import { Minus, Square, X } from "lucide-react"
import { useEffect, useState } from "react"

// 悬浮窗口控制按钮，fixed 定位在右上角，自身无背景，不破坏竖向色块连贯性
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    return window.ipc.onMaximizedChanged((v) => setIsMaximized(v))
  }, [])

  if (window.ipc.platform === "darwin") return null

  return (
    <div
      className="fixed top-0 right-0 flex items-center z-50"
      style={{ height: "48px", WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        className="w-[46px] h-full flex items-center justify-center text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
        onClick={() => window.ipc.windowMinimize()}
        title="最小化"
      >
        <Minus className="h-3 w-3" />
      </button>
      <button
        className="w-[46px] h-full flex items-center justify-center text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
        onClick={() => window.ipc.windowMaximize()}
        title={isMaximized ? "还原" : "最大化"}
      >
        <Square className="h-[11px] w-[11px]" />
      </button>
      <button
        className="w-[46px] h-full flex items-center justify-center text-muted-foreground/50 hover:bg-red-500 hover:text-white transition-colors"
        onClick={() => window.ipc.windowClose()}
        title="关闭"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
