import type { Delivery } from '../types'
import { MailError, type EmailParams, type Sender } from './mailer'

const DEFAULT_RATE_LIMIT_RETRIES = 2
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 2000

export interface Job {
  participantId: number
  params: EmailParams
}

export interface DeliveryOptions {
  send: Sender
  sleep: (ms: number) => Promise<void>
  intervalMs: number
  rateLimitRetries?: number
  rateLimitBackoffMs?: number
}

export type DeliveryUpdate = Pick<Delivery, 'status' | 'error'>

async function sendWithRetry(params: EmailParams, options: DeliveryOptions): Promise<void> {
  const { send, sleep, rateLimitRetries = DEFAULT_RATE_LIMIT_RETRIES, rateLimitBackoffMs = DEFAULT_RATE_LIMIT_BACKOFF_MS } = options
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(params)
    } catch (error) {
      const retryable = error instanceof MailError && error.rateLimited
      if (!retryable || attempt >= rateLimitRetries) throw error
      await sleep(rateLimitBackoffMs * (attempt + 1))
    }
  }
}

export async function deliverAll(
  jobs: readonly Job[],
  options: DeliveryOptions,
  onUpdate: (participantId: number, update: DeliveryUpdate) => void,
): Promise<void> {
  for (const [index, job] of jobs.entries()) {
    if (index > 0) await options.sleep(options.intervalMs)
    onUpdate(job.participantId, { status: 'sending' })
    try {
      await sendWithRetry(job.params, options)
      onUpdate(job.participantId, { status: 'sent' })
    } catch (error) {
      const message = error instanceof MailError ? error.message : 'Unexpected error while sending'
      onUpdate(job.participantId, { status: 'failed', error: message })
    }
  }
}
