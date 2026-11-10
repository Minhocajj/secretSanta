import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMAILJS_ENDPOINT,
  MailError,
  createSender,
  readMailConfig,
  sendEmail,
  sendIntervalMs,
  type EmailParams,
  type LiveMailConfig,
} from './mailer'

const live: LiveMailConfig = { mode: 'live', serviceId: 'service_x', templateId: 'template_y', publicKey: 'public_z' }
const params: EmailParams = { to_name: 'Alice', to_email: 'alice@example.com', message: 'Hello' }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('readMailConfig', () => {
  it('returns live settings, trimmed, when everything is provided', () => {
    expect(
      readMailConfig({
        VITE_EMAILJS_SERVICE_ID: ' service_x ',
        VITE_EMAILJS_TEMPLATE_ID: 'template_y',
        VITE_EMAILJS_PUBLIC_KEY: 'public_z',
      }),
    ).toEqual(live)
  })

  it('lists every missing setting, treating blanks and non-strings as missing', () => {
    expect(readMailConfig({ VITE_EMAILJS_SERVICE_ID: '   ', VITE_EMAILJS_TEMPLATE_ID: 42 })).toEqual({
      mode: 'unconfigured',
      missing: ['VITE_EMAILJS_SERVICE_ID', 'VITE_EMAILJS_TEMPLATE_ID', 'VITE_EMAILJS_PUBLIC_KEY'],
    })
  })

  it('prefers dry-run over live settings so nothing is sent by accident', () => {
    expect(
      readMailConfig({
        VITE_EMAILJS_DRY_RUN: 'true',
        VITE_EMAILJS_SERVICE_ID: 'a',
        VITE_EMAILJS_TEMPLATE_ID: 'b',
        VITE_EMAILJS_PUBLIC_KEY: 'c',
      }),
    ).toEqual({ mode: 'dry-run' })
  })

  it('only treats the exact string "true" as dry-run', () => {
    expect(readMailConfig({ VITE_EMAILJS_DRY_RUN: 'false' }).mode).toBe('unconfigured')
  })
})

describe('sendEmail', () => {
  it('posts the template parameters to the EmailJS REST endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('OK', { status: 200 }))

    await sendEmail(live, params, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(EMAILJS_ENDPOINT)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({
      service_id: 'service_x',
      template_id: 'template_y',
      user_id: 'public_z',
      template_params: params,
    })
  })

  it('reports the status and a bounded amount of detail when EmailJS rejects the request', async () => {
    const fetchImpl = async () => new Response(`${'bad '.repeat(100)}`, { status: 422 })
    const error = await sendEmail(live, params, fetchImpl).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(MailError)
    expect((error as MailError).rateLimited).toBe(false)
    expect((error as MailError).message).toMatch(/^EmailJS rejected the request \(422\): bad bad/)
    expect((error as MailError).message.length).toBeLessThan(260)
  })

  it('flags rate limiting so callers can retry', async () => {
    const fetchImpl = async () => new Response('Too many requests', { status: 429 })
    const error = await sendEmail(live, params, fetchImpl).catch((caught: unknown) => caught)

    expect((error as MailError).rateLimited).toBe(true)
  })

  it('turns network failures into a friendly error without leaking the original one', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch: secret internals')
    }

    await expect(sendEmail(live, params, fetchImpl)).rejects.toThrow(
      new MailError('Could not reach EmailJS - check your internet connection'),
    )
  })

  it('gives up on requests that never finish', async () => {
    vi.useFakeTimers()
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })

    const outcome = sendEmail(live, params, hanging).catch((caught: unknown) => caught)
    await vi.advanceTimersByTimeAsync(20_000)

    expect(((await outcome) as MailError).message).toBe('The request to EmailJS timed out')
  })
})

describe('createSender', () => {
  it('does nothing in dry-run mode', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await createSender({ mode: 'dry-run' })(params)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses to send when unconfigured', async () => {
    await expect(createSender({ mode: 'unconfigured', missing: [] })(params)).rejects.toThrow(MailError)
  })

  it('uses the global fetch in live mode', async () => {
    const fetchSpy = vi.fn(async () => new Response('OK'))
    vi.stubGlobal('fetch', fetchSpy)

    await createSender(live)(params)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('sendIntervalMs', () => {
  it('respects the EmailJS limit of one request per second in live mode', () => {
    expect(sendIntervalMs(live)).toBeGreaterThanOrEqual(1000)
    expect(sendIntervalMs({ mode: 'dry-run' })).toBeLessThan(1000)
    expect(sendIntervalMs({ mode: 'unconfigured', missing: [] })).toBe(0)
  })
})
