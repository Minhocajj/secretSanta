export const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send'

const REQUEST_TIMEOUT_MS = 20_000
const LIVE_INTERVAL_MS = 1100
const DRY_RUN_INTERVAL_MS = 150
const MAX_ERROR_DETAIL_LENGTH = 200

const ENV_NAMES = {
  serviceId: 'VITE_EMAILJS_SERVICE_ID',
  templateId: 'VITE_EMAILJS_TEMPLATE_ID',
  publicKey: 'VITE_EMAILJS_PUBLIC_KEY',
} as const

export interface LiveMailConfig {
  mode: 'live'
  serviceId: string
  templateId: string
  publicKey: string
}

export type MailConfig = LiveMailConfig | { mode: 'dry-run' } | { mode: 'unconfigured'; missing: string[] }

export interface EmailParams {
  to_name: string
  to_email: string
  message: string
}

export type Sender = (params: EmailParams) => Promise<void>

export class MailError extends Error {
  readonly rateLimited: boolean

  constructor(message: string, rateLimited = false) {
    super(message)
    this.name = 'MailError'
    this.rateLimited = rateLimited
  }
}

export function readMailConfig(env: Record<string, unknown>): MailConfig {
  if (env.VITE_EMAILJS_DRY_RUN === 'true') return { mode: 'dry-run' }

  const read = (name: string) => {
    const value = env[name]
    return typeof value === 'string' ? value.trim() : ''
  }
  const settings = {
    serviceId: read(ENV_NAMES.serviceId),
    templateId: read(ENV_NAMES.templateId),
    publicKey: read(ENV_NAMES.publicKey),
  }
  const missing = (Object.keys(ENV_NAMES) as (keyof typeof ENV_NAMES)[])
    .filter((key) => !settings[key])
    .map((key) => ENV_NAMES[key])

  return missing.length ? { mode: 'unconfigured', missing } : { mode: 'live', ...settings }
}

const isAbortError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'

export async function sendEmail(
  config: LiveMailConfig,
  params: EmailParams,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetchImpl(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: params,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    throw new MailError(
      isAbortError(error) ? 'The request to EmailJS timed out' : 'Could not reach EmailJS - check your internet connection',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, MAX_ERROR_DETAIL_LENGTH)
    throw new MailError(
      `EmailJS rejected the request (${response.status})${detail ? `: ${detail}` : ''}`,
      response.status === 429,
    )
  }
}

export function createSender(config: MailConfig): Sender {
  switch (config.mode) {
    case 'live':
      return (params) => sendEmail(config, params)
    case 'dry-run':
      return async () => {}
    case 'unconfigured':
      return async () => {
        throw new MailError('Email sending is not configured')
      }
  }
}

export function sendIntervalMs(config: MailConfig): number {
  switch (config.mode) {
    case 'live':
      return LIVE_INTERVAL_MS
    case 'dry-run':
      return DRY_RUN_INTERVAL_MS
    case 'unconfigured':
      return 0
  }
}
