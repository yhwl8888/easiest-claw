import { useEffect, useState } from "react"
import { Puzzle, Loader2, RefreshCw } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Skill {
  name: string
  description?: string
  version?: string
  enabled: boolean
  source?: string
}

export function parseSkillsResult(raw: unknown): Skill[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.skills)
      ? (raw as { skills: unknown[] }).skills
      : []

  return list
    .map((s) => {
      if (typeof s === 'string') return { name: s, enabled: true }
      const sk = s as Record<string, unknown>
      return {
        name: typeof sk.name === 'string' ? sk.name : '',
        description: typeof sk.description === 'string' ? sk.description : undefined,
        version: typeof sk.version === 'string' ? sk.version : undefined,
        enabled: typeof sk.enabled === 'boolean' ? sk.enabled : true,
        source: typeof sk.source === 'string' ? sk.source : undefined,
      }
    })
    .filter((s) => s.name)
}

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const loadSkills = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.ipc.skillsList()
      if (result.ok) {
        setSkills(parseSkillsResult(result.result))
      } else {
        setError((result as { ok: false; error: string }).error)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSkills() }, [])

  const handleToggle = async (name: string, enabled: boolean) => {
    setToggling(name)
    const prev = skills
    setSkills(skills.map((s) => (s.name === name ? { ...s, enabled } : s)))
    try {
      const result = await window.ipc.skillsToggle(name, enabled)
      if (!(result as { ok: boolean }).ok) {
        setSkills(prev)
        toast.error((result as { ok: false; error: string }).error ?? '操作失败')
      }
    } catch {
      setSkills(prev)
      toast.error('操作失败')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
      {/* Page Header */}
      <div
        className="shrink-0 flex items-center px-8 py-5 border-b bg-background"
        style={{
          WebkitAppRegion: "drag",
          ...(window.ipc.platform !== 'darwin' ? { paddingRight: '154px' } : {}),
        } as React.CSSProperties}
      >
        <div
          className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Puzzle className="h-5 w-5 text-primary" />
        </div>
        <div className="ml-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <h1 className="text-lg font-semibold">Skills</h1>
          <p className="text-xs text-muted-foreground">全局技能库管理</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {error ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              <p className="mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={loadSkills}>重试</Button>
            </Card>
          ) : (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Puzzle className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">全局技能库</h2>
                <button
                  onClick={loadSkills}
                  disabled={loading}
                  className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors disabled:pointer-events-none"
                  title="刷新"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </div>
              ) : skills.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无可用技能</p>
              ) : (
                <div className="space-y-0">
                  {skills.map((skill, i) => (
                    <div key={skill.name}>
                      {i > 0 && <Separator className="my-2.5 opacity-40" />}
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{skill.name}</span>
                            {skill.version && (
                              <span className="text-[10px] text-muted-foreground">v{skill.version}</span>
                            )}
                            {skill.source && (
                              <span className="text-[10px] text-muted-foreground/50">{skill.source}</span>
                            )}
                          </div>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                          )}
                        </div>

                        {/* Toggle switch */}
                        <button
                          onClick={() => handleToggle(skill.name, !skill.enabled)}
                          disabled={toggling === skill.name}
                          className={cn(
                            "shrink-0 w-9 h-5 rounded-full transition-colors relative",
                            skill.enabled ? "bg-primary" : "bg-muted-foreground/30",
                            toggling === skill.name && "opacity-50 cursor-not-allowed"
                          )}
                          title={skill.enabled ? "点击禁用" : "点击启用"}
                        >
                          <span
                            className={cn(
                              "absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                              skill.enabled ? "left-[18px]" : "left-[2px]"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
