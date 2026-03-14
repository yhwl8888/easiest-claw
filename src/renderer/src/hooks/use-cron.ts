import { useCallback, useState } from 'react'
import type { CronJob, CronJobCreateInput, CronListResult, CronRunLogResult, CronStatus } from '@/types/cron'

export function useCronJobs() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadJobs = useCallback(async (_includeDisabled = true) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.ipc.cronList()
      if (!res?.ok) {
        setError((res as { error?: string })?.error ?? 'Failed to load cron jobs')
        return null
      }
      const list = res.result as { jobs: CronJob[]; total: number }
      setJobs(list.jobs ?? [])
      setTotal(list.total ?? 0)
      return list as unknown as CronListResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load cron jobs'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { jobs, total, loading, error, loadJobs }
}

export function useCronStatus() {
  const [status, setStatus] = useState<CronStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.ipc.cronStatus()
      if (res?.ok) {
        setStatus(res.result as CronStatus)
        return res.result as CronStatus
      }
      return null
    } catch { return null } finally { setLoading(false) }
  }, [])

  return { status, loading, loadStatus }
}

export function useCronRuns() {
  const [runs, setRuns] = useState<CronRunLogResult | null>(null)
  const [loading, setLoading] = useState(false)

  const loadRuns = useCallback(async (jobId?: string) => {
    setLoading(true)
    try {
      if (!jobId) return null
      const res = await window.ipc.cronRuns({ jobId })
      if (res?.ok) {
        setRuns(res.result as CronRunLogResult)
        return res.result as CronRunLogResult
      }
      return null
    } catch { return null } finally { setLoading(false) }
  }, [])

  return { runs, loading, loadRuns }
}

export function useCronMutations() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addJob = useCallback(async (input: CronJobCreateInput) => {
    setLoading(true); setError(null)
    try {
      const res = await window.ipc.cronAdd(input as unknown as Record<string, unknown>)
      if (!res?.ok) { setError((res as {error?:string})?.error ?? 'Failed'); return null }
      return res.result as CronJob
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); return null }
    finally { setLoading(false) }
  }, [])

  const removeJob = useCallback(async (id: string) => {
    setLoading(true); setError(null)
    try {
      const res = await window.ipc.cronRemove({ jobId: id })
      if (!res?.ok) { setError((res as {error?:string})?.error ?? 'Failed'); return false }
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); return false }
    finally { setLoading(false) }
  }, [])

  const runJob = useCallback(async (id: string) => {
    setLoading(true); setError(null)
    try {
      const res = await window.ipc.cronRun({ jobId: id })
      if (!res?.ok) { setError((res as {error?:string})?.error ?? 'Failed'); return false }
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); return false }
    finally { setLoading(false) }
  }, [])

  const updateJob = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setLoading(true); setError(null)
    try {
      const res = await window.ipc.cronUpdate({ id, patch })
      if (!res?.ok) { setError((res as {error?:string})?.error ?? 'Failed'); return false }
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); return false }
    finally { setLoading(false) }
  }, [])

  return { loading, error, addJob, removeJob, runJob, updateJob }
}
