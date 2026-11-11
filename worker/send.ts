import { EMAILJS_ENDPOINT } from '../src/lib/mailer'
import { RpcError, createRpcClient } from '../src/lib/rpcClient'

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
  EMAILJS_SERVICE_ID?: string
  EMAILJS_TEMPLATE_ID?: string
  EMAILJS_PUBLIC_KEY?: string
  EMAILJS_PRIVATE_KEY?: string
}

export const MAX_BODY_CHARS = 8_192
export const MAX_MESSAGE_CHARS = 2_000
const MAX_ERROR_DETAIL_CHARS = 200
const EMAILJS_TIMEOUT_MS = 20_000

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'EMAILJS_SERVICE_ID',
  'EMAILJS_TEMPLATE_ID',
  'EMAILJS_PUBLIC_KEY',
  'EMAILJS_PRIVATE_KEY',
] as const satisfies readonly (keyof Env)[]

export function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

const fail = (status: number, error: string, message: string) => json(status, { error, message })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

interface SendRequest {
  sessionId: string
  adminToken: string
  participantId: number
  message: string
}

function parseRequest(text: string): SendRequest | null {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(body)) return null

  const { session_id, admin_token, participant_id, message } = body
  if (typeof session_id !== 'string' || session_id.length < 1 || session_id.length > 64) return null
  if (typeof admin_token !== 'string' || admin_token.length < 1 || admin_token.length > 200) return null
  if (typeof participant_id !== 'number' || !Number.isSafeInteger(participant_id) || participant_id < 1) return null
  if (typeof message !== 'string' || message.trim().length < 1 || message.length > MAX_MESSAGE_CHARS) return null
  return { sessionId: session_id, adminToken: admin_token, participantId: participant_id, message }
}

const APP_ERROR = /^app:([a-z_]+)/

function authorizationFailure(error: unknown): Response {
  if (error instanceof RpcError) {
    switch (APP_ERROR.exec(error.message)?.[1]) {
      case 'not_found':
        return fail(404, 'not_found', 'This session or person does not exist, or the admin link is wrong')
      case 'conflict':
        return fail(409, 'not_ready', 'Emails can only be sent after the session is closed and the draw has started')
      case 'rate_limited':
        return fail(403, 'send_limit', 'The sending limit was reached for this person or for today. Try again tomorrow')
    }
  }
  return fail(502, 'unavailable', 'Could not reach the database')
}

interface Recipient {
  name: string
  email: string
}

const isRecipient = (value: unknown): value is Recipient =>
  isRecord(value) && typeof value.name === 'string' && typeof value.email === 'string' && value.email !== ''

export async function handleSend(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed', message: 'Use POST' }, { Allow: 'POST' })
  }

  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim())
  if (missing.length) {
    return fail(503, 'not_configured', `Email sending is not configured on the server (missing: ${missing.join(', ')})`)
  }

  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return fail(413, 'too_large', 'The request is too large')
  const input = parseRequest(text)
  if (!input) return fail(400, 'bad_request', 'The request is not valid')

  const rpc = createRpcClient({ url: env.SUPABASE_URL!.trim().replace(/\/+$/, ''), publishableKey: env.SUPABASE_PUBLISHABLE_KEY!.trim() }, fetchImpl)
  let recipient: unknown
  try {
    recipient = await rpc('authorize_send', {
      p_session_id: input.sessionId,
      p_admin_token: input.adminToken,
      p_participant_id: input.participantId,
    })
  } catch (error) {
    return authorizationFailure(error)
  }
  if (!isRecipient(recipient)) return fail(502, 'unavailable', 'The database answered unexpectedly')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMAILJS_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetchImpl(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: env.EMAILJS_SERVICE_ID!.trim(),
        template_id: env.EMAILJS_TEMPLATE_ID!.trim(),
        user_id: env.EMAILJS_PUBLIC_KEY!.trim(),
        accessToken: env.EMAILJS_PRIVATE_KEY!.trim(),
        template_params: { to_name: recipient.name, to_email: recipient.email, message: input.message },
      }),
      signal: controller.signal,
    })
  } catch {
    return fail(502, 'mail_failed', 'Could not reach EmailJS')
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 429) return fail(429, 'rate_limited', 'EmailJS is limiting requests')
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, MAX_ERROR_DETAIL_CHARS)
    return fail(502, 'mail_failed', `EmailJS rejected the request (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  return json(200, { ok: true })
}
