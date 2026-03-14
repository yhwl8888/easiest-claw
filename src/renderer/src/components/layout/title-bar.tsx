import { useEffect, useState } from "react"
import { Minus, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Fixed window controls overlay — does NOT take up layout space.
// Drag region is provided by the NavRail drag strip instead.
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const isWindows = window.ipc.platform === "win32" || window.ipc.platform === "linux"

  useEffect(() => {
    if (!isWindows) return
    const unsubscribe = window.ipc.onMaximizedChanged(setIsMaximized)
    return () => { unsubscribe() }
  }, [isWindows])

  if (!isWindows) return null

  return (
    <div
      className="fixed top-0 right-0 z-50 flex h-12"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <button
        type="button"
        className="w-10 h-full flex items-center justify-center text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
        onClick={() => window.ipc.windowMinimize()}
      >
        <Minus className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="w-10 h-full flex items-center justify-center text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
        onClick={() => window.ipc.windowMaximize()}
      >
        {isMaximized ? (
          <svg className="h-3 w-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 3h5v5H2z" />
            <path d="M3 3V2h5v5H7" />
          </svg>
        ) : (
          <Square className="h-3 w-3" />
        )}
      </button>
      <button
        type="button"
        className={cn(
          "w-10 h-full flex items-center justify-center text-muted-foreground/60 transition-colors",
          "hover:bg-red-500 hover:text-white"
        )}
        onClick={() => window.ipc.windowClose()}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
