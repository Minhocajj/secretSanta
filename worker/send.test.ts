import { describe, expect, it, vi } from 'vitest'
import worker from './index'
import { MAX_MESSAGE_CHARS, handleSend, type Env } from './send'

const env: Env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  EMAILJS_SERVICE_ID: 'service_x',
  EMAILJS_TEMPLATE_ID: 'template_y',
  EMAILJS_PUBLIC_KEY: 'public_z',
  EMAILJS_PRIVATE_KEY: 'private_secret',
}

const validBody = { session_id: 'sess-1', admin_token: 'tok-1', participant_id: 7, message: 'You were chosen' }

const post = (body: unknown, init: RequestInit = {}) =>
  new Request('https://example.com/api/send', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  })

const rpcError = (message: string, status = 400) => Response.json({ code: 'P0001', message }, { status })

interface Calls {
  rpc: { url: string; headers: Headers; body: Record<string, unknown> }[]
  mail: { url: string; body: Record<string, unknown> }[]
}

function fakeFetch(options: { rpc?: () => Response; mail?: () => Response } = {}) {
  const calls: Calls = { rpc: [], mail: [] }
  const rpc = options.rpc ?? (() => Response.json({ name: 'Alice', email: 'alice@example.com' }))
  const mail = options.mail ?? (() => new Response('OK'))
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body))
    if (url.startsWith('https://project.supabase.co/')) {
      calls.rpc.push({ url, headers: new Headers(init?.headers), body })
      return rpc()
    }
    calls.mail.push({ url, body })
    return mail()
  })
  return { fetchImpl, calls }
}

const answer = async (response: Response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> })

describe('POST /api/send', () => {
  it('authorizes in the database, then sends to the recipient the database returned', async () => {
    const { fetchImpl, calls } = fakeFetch()

    const result = await answer(await handleSend(post(validBody), env, fetchImpl))

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(calls.rpc).toHaveLength(1)
    expect(calls.rpc[0].url).toBe('https://project.supabase.co/rest/v1/rpc/authorize_send')
    expect(calls.rpc[0].headers.get('apikey')).toBe('sb_publishable_test')
    expect(calls.rpc[0].body).toEqual({ p_session_id: 'sess-1', p_admin_token: 'tok-1', p_participant_id: 7 })
    expect(calls.mail).toEqual([
      {
        url: 'https://api.emailjs.com/api/v1.0/email/send',
        body: {
          service_id: 'service_x',
          template_id: 'template_y',
          user_id: 'public_z',
          accessToken: 'private_secret',
          template_params: { to_name: 'Alice', to_email: 'alice@example.com', message: 'You were chosen' },
        },
      },
    ])
  })

  it('takes the recipient from the database even if the browser sends one', async () => {
    const { fetchImpl, calls } = fakeFetch()

    await handleSend(post({ ...validBody, to_email: 'attacker@example.com', to_name: 'Mallory' }), env, fetchImpl)

    expect(JSON.stringify(calls.mail)).not.toContain('attacker@example.com')
    expect(JSON.stringify(calls.mail)).not.toContain('Mallory')
  })

  it.each([
    ['app:not_found', 404, 'not_found'],
    ['app:conflict', 409, 'not_ready'],
    ['app:rate_limited', 403, 'send_limit'],
  ])('maps the database answer %s to %i without sending any email', async (message, status, error) => {
    const { fetchImpl, calls } = fakeFetch({ rpc: () => rpcError(message) })

    const result = await answer(await handleSend(post(validBody), env, fetchImpl))

    expect(result.status).toBe(status)
    expect(result.body.error).toBe(error)
    expect(calls.mail).toEqual([])
  })

  it('answers 502 when the database cannot be reached or misbehaves', async () => {
    const unreachable = await answer(
      await handleSend(post(validBody), env, async () => {
        throw new TypeError('network down')
      }),
    )
    const odd = await answer(await handleSend(post(validBody), env, fakeFetch({ rpc: () => Response.json('nope') }).fetchImpl))
    const broken = await answer(await handleSend(post(validBody), env, fakeFetch({ rpc: () => rpcError('boom', 500) }).fetchImpl))

    expect(unreachable.status).toBe(502)
    expect(odd.status).toBe(502)
    expect(broken.status).toBe(502)
  })

  it('passes EmailJS rate limiting through as 429 so the client retries', async () => {
    const { fetchImpl } = fakeFetch({ mail: () => new Response('Too many', { status: 429 }) })

    const result = await answer(await handleSend(post(validBody), env, fetchImpl))

    expect(result).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
  })

  it('maps other EmailJS failures to 502 with bounded detail and never echoes secrets', async () => {
    const { fetchImpl } = fakeFetch({ mail: () => new Response('x'.repeat(500), { status: 422 }) })

    const result = await answer(await handleSend(post(validBody), env, fetchImpl))

    expect(result.status).toBe(502)
    expect(result.body.error).toBe('mail_failed')
    expect(String(result.body.message)).toMatch(/^EmailJS rejected the request \(422\): x+$/)
    expect(String(result.body.message).length).toBeLessThan(260)
    expect(JSON.stringify(result.body)).not.toContain('private_secret')
  })

  it('answers 502 when EmailJS cannot be reached', async () => {
    const { fetchImpl } = fakeFetch()
    const failing: typeof fetch = async (input, init) => {
      if (String(input).startsWith('https://api.emailjs.com')) throw new TypeError('down')
      return fetchImpl(input, init)
    }

    const result = await answer(await handleSend(post(validBody), env, failing))

    expect(result).toMatchObject({ status: 502, body: { error: 'mail_failed' } })
  })

  it.each(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY'] as const)(
    'says clearly that it is not configured when %s is missing',
    async (name) => {
      const { fetchImpl, calls } = fakeFetch()

      const result = await answer(await handleSend(post(validBody), { ...env, [name]: '  ' }, fetchImpl))

      expect(result.status).toBe(503)
      expect(result.body.error).toBe('not_configured')
      expect(String(result.body.message)).toContain(name)
      expect(calls.rpc).toEqual([])
      expect(calls.mail).toEqual([])
    },
  )

  it.each([
    ['not json', 'not json'],
    ['an array', []],
    ['no session', { ...validBody, session_id: undefined }],
    ['no token', { ...validBody, admin_token: '' }],
    ['a string participant id', { ...validBody, participant_id: '7' }],
    ['a fractional participant id', { ...validBody, participant_id: 1.5 }],
    ['a zero participant id', { ...validBody, participant_id: 0 }],
    ['no message', { ...validBody, message: undefined }],
    ['a blank message', { ...validBody, message: '   ' }],
    ['a too long message', { ...validBody, message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }],
  ])('rejects %s before touching the database', async (_label, body) => {
    const { fetchImpl, calls } = fakeFetch()

    const result = await answer(await handleSend(post(body), env, fetchImpl))

    expect(result).toMatchObject({ status: 400, body: { error: 'bad_request' } })
    expect(calls.rpc).toEqual([])
    expect(calls.mail).toEqual([])
  })

  it('accepts a message of exactly the maximum length', async () => {
    const { fetchImpl } = fakeFetch()

    const result = await answer(await handleSend(post({ ...validBody, message: 'x'.repeat(MAX_MESSAGE_CHARS) }), env, fetchImpl))

    expect(result.status).toBe(200)
  })

  it('rejects oversized bodies', async () => {
    const { fetchImpl, calls } = fakeFetch()

    const result = await answer(await handleSend(post({ ...validBody, padding: 'x'.repeat(10_000) }), env, fetchImpl))

    expect(result.status).toBe(413)
    expect(calls.rpc).toEqual([])
  })

  it.each(['GET', 'PUT', 'DELETE'])('refuses %s', async (method) => {
    const response = await handleSend(new Request('https://example.com/api/send', { method }), env, fakeFetch().fetchImpl)

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
  })

  it('never caches answers', async () => {
    const response = await handleSend(post(validBody), env, fakeFetch().fetchImpl)

    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('never logs request bodies', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method))

    await handleSend(post(validBody), env, fakeFetch().fetchImpl)
    await handleSend(post(validBody), env, fakeFetch({ rpc: () => rpcError('app:not_found') }).fetchImpl)

    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

describe('worker routing', () => {
  it('handles /api/send and answers 404 for other API paths', async () => {
    const send = await worker.fetch(new Request('https://example.com/api/send', { method: 'GET' }), env)
    const other = await worker.fetch(new Request('https://example.com/api/other'), env)

    expect(send.status).toBe(405)
    expect(other.status).toBe(404)
  })
})
