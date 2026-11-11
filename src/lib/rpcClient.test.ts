import { afterEach, describe, expect, it, vi } from 'vitest'
import { RpcError, createRpcClient } from './rpcClient'

const connection = { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_test' }

const reply = (body: string, status = 200) => new Response(body, { status })

async function failure(promise: Promise<unknown>): Promise<RpcError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RpcError) return error
    throw error
  }
  throw new Error('Expected the call to fail')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createRpcClient', () => {
  it('posts the arguments as JSON to the function endpoint with only the publishable key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(reply('{"ok":true}'))

    const result = await createRpcClient(connection, fetchImpl)('create_session', { p_title: 'Party' })

    expect(result).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/create_session')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"p_title":"Party"}')
    expect(init?.headers).toEqual({ apikey: 'sb_publishable_test', 'Content-Type': 'application/json' })
  })

  it('returns null for an empty answer', async () => {
    const noContent = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const emptyBody = vi.fn<typeof fetch>().mockResolvedValue(reply(''))

    await expect(createRpcClient(connection, noContent)('close_session', {})).resolves.toBeNull()
    await expect(createRpcClient(connection, emptyBody)('close_session', {})).resolves.toBeNull()
  })

  it('turns a PostgREST error into an RpcError carrying code, details and hint', async () => {
    const body = JSON.stringify({ code: 'P0001', message: 'app:invalid', details: '{"title":"required"}', hint: null })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(reply(body, 400))

    const error = await failure(createRpcClient(connection, fetchImpl)('create_session', {}))

    expect(error).toMatchObject({
      status: 400,
      code: 'P0001',
      message: 'app:invalid',
      details: '{"title":"required"}',
      hint: null,
    })
  })

  it('copes with error bodies that are not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(reply('<html>Bad gateway</html>', 502))

    const error = await failure(createRpcClient(connection, fetchImpl)('create_session', {}))

    expect(error).toMatchObject({ status: 502, code: null, details: null })
    expect(error.message).toContain('502')
  })

  it('rejects a successful answer that is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(reply('<html>captive portal</html>'))

    const error = await failure(createRpcClient(connection, fetchImpl)('create_session', {}))

    expect(error.status).toBe(200)
  })

  it('reports a network failure without leaking the key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await failure(createRpcClient(connection, fetchImpl)('create_session', {}))

    expect(error.status).toBe(0)
    expect(error.message).not.toContain('sb_publishable_test')
  })

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )

    const pending = failure(createRpcClient(connection, fetchImpl)('create_session', {}))
    await vi.advanceTimersByTimeAsync(15_000)

    expect((await pending).status).toBe(0)
    expect(signal?.aborted).toBe(true)
  })
})
