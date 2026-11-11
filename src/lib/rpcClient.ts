const REQUEST_TIMEOUT_MS = 15_000

export type RpcClient = (fn: string, args: Record<string, unknown>) => Promise<unknown>

export interface RpcErrorInit {
  status: number
  code?: string | null
  details?: string | null
  hint?: string | null
}

export class RpcError extends Error {
  readonly status: number
  readonly code: string | null
  readonly details: string | null
  readonly hint: string | null

  constructor(message: string, { status, code = null, details = null, hint = null }: RpcErrorInit) {
    super(message)
    this.name = 'RpcError'
    this.status = status
    this.code = code
    this.details = details
    this.hint = hint
  }
}

export interface SupabaseConnection {
  url: string
  publishableKey: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null)

function parseJson(text: string): unknown {
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function createRpcClient(connection: SupabaseConnection, fetchImpl: typeof fetch = fetch): RpcClient {
  const base = `${connection.url}/rest/v1/rpc/`

  return async (fn, args) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response
    let text: string
    try {
      response = await fetchImpl(`${base}${encodeURIComponent(fn)}`, {
        method: 'POST',
        headers: { apikey: connection.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: controller.signal,
      })
      text = await response.text()
    } catch {
      throw new RpcError('Could not reach the server', { status: 0 })
    } finally {
      clearTimeout(timeout)
    }

    const payload = parseJson(text)
    if (!response.ok) {
      const body = isRecord(payload) ? payload : {}
      throw new RpcError(textOrNull(body.message) ?? `The server answered with status ${response.status}`, {
        status: response.status,
        code: textOrNull(body.code),
        details: textOrNull(body.details),
        hint: textOrNull(body.hint),
      })
    }
    if (payload === undefined) throw new RpcError('The server sent an unreadable answer', { status: response.status })
    return payload
  }
}
