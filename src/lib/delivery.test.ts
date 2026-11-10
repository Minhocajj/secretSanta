import { describe, expect, it, vi } from 'vitest'
import { deliverAll, type DeliveryOptions, type DeliveryUpdate, type Job } from './delivery'
import { MailError, type EmailParams } from './mailer'

const job = (participantId: number): Job => ({
  participantId,
  params: { to_name: `P${participantId}`, to_email: `p${participantId}@example.com`, message: `message ${participantId}` },
})

function setup(send: (params: EmailParams) => Promise<void> = async () => {}, extra: Partial<DeliveryOptions> = {}) {
  const events: string[] = []
  const updates: [number, DeliveryUpdate][] = []
  const sleep = vi.fn(async (ms: number) => {
    events.push(`sleep ${ms}`)
  })
  const sendSpy = vi.fn(async (params: EmailParams) => {
    events.push(`send ${params.to_name}`)
    await send(params)
  })
  const options: DeliveryOptions = { send: sendSpy, sleep, intervalMs: 1100, ...extra }
  const onUpdate = (id: number, update: DeliveryUpdate) => {
    updates.push([id, update])
  }
  return { options, onUpdate, events, updates, sendSpy, sleep }
}

describe('deliverAll', () => {
  it('sends one email per job in order, pausing between requests but not before the first', async () => {
    const { options, onUpdate, events } = setup()

    await deliverAll([job(1), job(2), job(3)], options, onUpdate)

    expect(events).toEqual(['send P1', 'sleep 1100', 'send P2', 'sleep 1100', 'send P3'])
  })

  it('reports sending then sent for every job', async () => {
    const { options, onUpdate, updates } = setup()

    await deliverAll([job(1), job(2)], options, onUpdate)

    expect(updates).toEqual([
      [1, { status: 'sending' }],
      [1, { status: 'sent' }],
      [2, { status: 'sending' }],
      [2, { status: 'sent' }],
    ])
  })

  it('keeps going after a failure and records the reason', async () => {
    const { options, onUpdate, updates, sendSpy } = setup(async (params) => {
      if (params.to_name === 'P2') throw new MailError('EmailJS rejected the request (422): bad address')
    })

    await deliverAll([job(1), job(2), job(3)], options, onUpdate)

    expect(sendSpy).toHaveBeenCalledTimes(3)
    expect(updates.filter(([, update]) => update.status !== 'sending')).toEqual([
      [1, { status: 'sent' }],
      [2, { status: 'failed', error: 'EmailJS rejected the request (422): bad address' }],
      [3, { status: 'sent' }],
    ])
  })

  it('does not leak unexpected error details', async () => {
    const { options, onUpdate, updates } = setup(async () => {
      throw new Error('internal stack details')
    })

    await deliverAll([job(1)], options, onUpdate)

    expect(updates.at(-1)).toEqual([1, { status: 'failed', error: 'Unexpected error while sending' }])
  })

  it('retries rate-limited requests with a growing backoff', async () => {
    let calls = 0
    const { options, onUpdate, updates, events } = setup(
      async () => {
        calls++
        if (calls <= 2) throw new MailError('slow down', true)
      },
      { rateLimitBackoffMs: 500 },
    )

    await deliverAll([job(1)], options, onUpdate)

    expect(events).toEqual(['send P1', 'sleep 500', 'send P1', 'sleep 1000', 'send P1'])
    expect(updates.at(-1)).toEqual([1, { status: 'sent' }])
  })

  it('fails the job when it stays rate limited after the allowed retries', async () => {
    const { options, onUpdate, updates, sendSpy } = setup(
      async () => {
        throw new MailError('slow down', true)
      },
      { rateLimitRetries: 2 },
    )

    await deliverAll([job(1)], options, onUpdate)

    expect(sendSpy).toHaveBeenCalledTimes(3)
    expect(updates.at(-1)).toEqual([1, { status: 'failed', error: 'slow down' }])
  })

  it('never retries other errors, because the email may already have gone out', async () => {
    const { options, onUpdate, sendSpy } = setup(async () => {
      throw new MailError('Could not reach EmailJS')
    })

    await deliverAll([job(1)], options, onUpdate)

    expect(sendSpy).toHaveBeenCalledTimes(1)
  })
})
