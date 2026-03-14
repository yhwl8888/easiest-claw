import { useState, useEffect } from 'react'
import { ExternalLink, PackageCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Action = 'connect' | 'stop-and-start'

export function PortConflictDialog() {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState<Action | null>(null)

  useEffect(() => {
    window.ipc.envDetect().then((res) => {
      if (res.ok && res.result.portConflict) {
        setVisible(true)
      }
    }).catch(() => {})
  }, [])

  if (!visible) return null

  const handleAction = async (action: Action) => {
    setLoading(action)
    try {
      await window.ipc.gatewayResolveConflict(action)
    } catch (e) {
      console.error('[PortConflictDialog]', e)
    } finally {
      setLoading(null)
      setVisible(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-xl border bg-card shadow-lg p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">检测到本地 OpenClaw 正在运行</h2>
          <p className="text-sm text-muted-foreground">
            端口 18789 已被占用。请选择如何继续：
          </p>
        </div>

        <div className="space-y-2">
          <button
            className="w-full flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading !== null}
            onClick={() => handleAction('connect')}
          >
            <div className="mt-0.5 shrink-0">
              {loading === 'connect'
                ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                : <ExternalLink className="h-4 w-4 text-primary" />
              }
            </div>
            <div>
              <p className="text-sm font-medium">直接连接</p>
              <p className="text-xs text-muted-foreground">使用已运行的外部 OpenClaw，Token 从配置文件读取</p>
            </div>
          </button>

          <button
            className="w-full flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading !== null}
            onClick={() => handleAction('stop-and-start')}
          >
            <div className="mt-0.5 shrink-0">
              {loading === 'stop-and-start'
                ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                : <PackageCheck className="h-4 w-4 text-primary" />
              }
            </div>
            <div>
              <p className="text-sm font-medium">停止并启动内置</p>
              <p className="text-xs text-muted-foreground">停止外部 OpenClaw，改用应用内置版本</p>
            </div>
          </button>
        </div>

        {loading && (
          <p className="text-xs text-center text-muted-foreground animate-pulse">
            {loading === 'connect' ? '正在连接...' : '正在停止外部进程并启动内置 Gateway...'}
          </p>
        )}
      </div>
    </div>
  )
}
