export type ConnectionStatus =
  | 'stopped'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type DomainEvent =
  | {
      type: 'runtime.status'
      status: ConnectionStatus
      asOf: string
      reason: string | null
    }
  | {
      type: 'gateway.event'
      event: string
      seq: number | null
      connectionEpoch?: string | null
      payload: unknown
      asOf: string
    }

export type GatewayEventFrame = {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
}

export type GatewayResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export type GatewaySettings = {
  url: string
  token: string
}
