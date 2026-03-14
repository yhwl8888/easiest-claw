import { getRuntime } from '../gateway/runtime'

/**
 * Wrap a gateway request with a consistent { ok, result } / { ok, error } shape.
 * Returns { ok: false } immediately when the adapter is not connected.
 */
export const gw = async <T>(
  method: string,
  params: unknown,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> => {
  const adapter = getRuntime()
  if (!adapter) return { ok: false, error: 'Gateway not connected.' }
  try {
    const result = await adapter.request<T>(method, params)
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
