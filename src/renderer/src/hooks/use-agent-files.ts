

import { useCallback, useState } from "react"
import type { AgentFileName } from "@/lib/agents/agentFiles"

type FileState = {
  loading: boolean
  saving: boolean
  error: string | null
  content: string
  exists: boolean
}

const initialFileState: FileState = {
  loading: false,
  saving: false,
  error: null,
  content: "",
  exists: false,
}

export function useAgentFiles() {
  const [fileState, setFileState] = useState<FileState>(initialFileState)

  const loadFile = useCallback(async (agentId: string, name: AgentFileName) => {
    setFileState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const res = await window.ipc.agentsFilesGet({ agentId, name })
      if (!res.ok) {
        setFileState((prev) => ({
          ...prev,
          loading: false,
          error: (res as { error?: string }).error ?? "Failed to load file",
        }))
        return
      }
      const file = (res.result as { file?: { content?: string; missing?: boolean } })?.file
      const content = typeof file?.content === "string" ? file.content : ""
      const exists = file?.missing !== true
      setFileState({ loading: false, saving: false, error: null, content, exists })
    } catch (err) {
      setFileState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load file",
      }))
    }
  }, [])

  const saveFile = useCallback(
    async (agentId: string, name: AgentFileName, content: string) => {
      setFileState((prev) => ({ ...prev, saving: true, error: null }))
      try {
        const res = await window.ipc.agentsFilesSet({ agentId, name, content })
        if (!res.ok) {
          setFileState((prev) => ({
            ...prev,
            saving: false,
            error: (res as { error?: string }).error ?? "Failed to save file",
          }))
          return false
        }
        setFileState((prev) => ({ ...prev, saving: false, content, exists: true }))
        return true
      } catch (err) {
        setFileState((prev) => ({
          ...prev,
          saving: false,
          error: err instanceof Error ? err.message : "Failed to save file",
        }))
        return false
      }
    },
    []
  )

  const resetFile = useCallback(() => {
    setFileState(initialFileState)
  }, [])

  return { fileState, loadFile, saveFile, resetFile }
}
