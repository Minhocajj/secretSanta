import { describe, expect, it, vi } from 'vitest'
import { RpcError, type RpcClient } from './rpcClient'
import { SessionApiError } from './sessionApi'
import { SupabaseSessionApi, toSessionError } from './supabaseSessionApi'

const apiReturning = (value: unknown) => {
  const rpc = vi.fn<RpcClient>().mockResolvedValue(value)
  return { api: new SupabaseSessionApi(rpc), rpc }
}

const apiFailing = (error: unknown) => new SupabaseSessionApi(vi.fn<RpcClient>().mockRejectedValue(error))

const serverError = (message: string, details: string | null = null) =>
  new RpcError(message, { status: 400, code: 'P0001', details })

async function failure(promise: Promise<unknown>): Promise<SessionApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof SessionApiError) return error
    throw error
  }
  throw new Error('Expected the call to fail')
}

const adminSession = {
  id: 's1',
  title: 'Party',
  description: '',
  status: 'closed',
  full: false,
  created_at: '2026-11-11T12:34:56.789012+00:00',
  draw_started_at: null,
}

describe('SupabaseSessionApi requests', () => {
  it('sends normalized values under the SQL parameter names', async () => {
    const { api, rpc } = apiReturning({ id: 's1', admin_token: 't1' })

    await expect(api.createSession({ title: '  Office   party ', description: ' fun ' })).resolves.toEqual({
      id: 's1',
      adminToken: 't1',
    })

    expect(rpc).toHaveBeenCalledWith('create_session', { p_title: 'Office party', p_description: 'fun' })
  })

  it('sends every call to its own function', async () => {
    const { api, rpc } = apiReturning(null)

    await api.join('s1', { name: ' Alice  Smith ', email: ' a@b.co ', gift: '' })
    await api.removeParticipant('s1', 'tok', 7)
    await api.closeSession('s1', 'tok')
    await api.reopenSession('s1', 'tok')
    await api.markDrawStarted('s1', 'tok')
    await api.completeSession('s1', 'tok')
    await api.deleteSession('s1', 'tok')

    const admin = { p_session_id: 's1', p_admin_token: 'tok' }
    expect(rpc.mock.calls).toEqual([
      ['join_session', { p_session_id: 's1', p_name: 'Alice Smith', p_email: 'a@b.co', p_gift: '' }],
      ['remove_participant', { ...admin, p_participant_id: 7 }],
      ['close_session', admin],
      ['reopen_session', admin],
      ['mark_draw_started', admin],
      ['complete_session', admin],
      ['delete_session', admin],
    ])
  })
})

describe('SupabaseSessionApi responses', () => {
  it('reads the public session', async () => {
    const { api } = apiReturning({ id: 's1', title: 'Party', description: 'Fun', status: 'open', full: true })

    await expect(api.getPublicSession('s1')).resolves.toEqual({
      id: 's1',
      title: 'Party',
      description: 'Fun',
      status: 'open',
      full: true,
    })
  })

  it('reads the admin view with ISO timestamps', async () => {
    const { api } = apiReturning({
      session: { ...adminSession, draw_started_at: '2026-11-12T08:00:00+00:00' },
      participants: [{ id: 3, name: 'Alice', email: 'alice@example.com', gift: 'a book' }],
    })

    await expect(api.getAdminView('s1', 'tok')).resolves.toEqual({
      session: {
        id: 's1',
        title: 'Party',
        description: '',
        status: 'closed',
        full: false,
        createdAt: '2026-11-11T12:34:56.789Z',
        drawStartedAt: '2026-11-12T08:00:00.000Z',
      },
      participants: [{ id: 3, name: 'Alice', email: 'alice@example.com', gift: 'a book' }],
    })
  })

  it('reads an added participant', async () => {
    const { api } = apiReturning({ id: 4, name: 'Bob', email: 'bob@example.com', gift: '' })

    await expect(api.addParticipant('s1', 'tok', { name: 'Bob', email: 'bob@example.com', gift: '' })).resolves.toEqual({
      id: 4,
      name: 'Bob',
      email: 'bob@example.com',
      gift: '',
    })
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing field', { id: 's1', title: 'Party', description: '', status: 'open' }],
    ['an unknown status', { id: 's1', title: 'Party', description: '', status: 'archived', full: false }],
    ['a wrong field type', { id: 's1', title: 'Party', description: '', status: 'open', full: 'no' }],
  ])('treats %s as an unreadable public session', async (_label, value) => {
    const error = await failure(apiReturning(value).api.getPublicSession('s1'))

    expect(error.code).toBe('unavailable')
  })

  it.each([
    ['no participants list', { session: adminSession }],
    ['a bad timestamp', { session: { ...adminSession, created_at: 'yesterday' }, participants: [] }],
    ['a bad participant', { session: adminSession, participants: [{ id: '3', name: 'A', email: 'a@b.co', gift: '' }] }],
  ])('treats %s as an unreadable admin view', async (_label, value) => {
    const error = await failure(apiReturning(value).api.getAdminView('s1', 'tok'))

    expect(error.code).toBe('unavailable')
  })

  it('treats an unreadable creation answer as unavailable', async () => {
    const error = await failure(apiReturning({ id: 's1' }).api.createSession({ title: 'Party', description: '' }))

    expect(error.code).toBe('unavailable')
  })
})

describe('toSessionError', () => {
  it.each(['not_found', 'closed', 'full', 'conflict', 'rate_limited'] as const)('maps app:%s', (code) => {
    const error = toSessionError(serverError(`app:${code}`))

    expect(error).toBeInstanceOf(SessionApiError)
    expect(error.code).toBe(code)
    expect(error.fields).toEqual({})
  })

  it('turns invalid details into the field messages the client validators use', () => {
    const details = JSON.stringify({ name: 'taken', email: 'invalid', gift: 'too_long', title: 'required' })

    expect(toSessionError(serverError('app:invalid', details))).toMatchObject({
      code: 'invalid',
      fields: {
        name: 'Someone with this name is already on the list',
        email: 'Enter a valid email address',
        gift: 'Gift idea must be at most 200 characters',
        title: 'Title is required',
      },
    })
  })

  it('falls back to a generic message for reasons it does not know', () => {
    const details = JSON.stringify({ name: 'mystery', unknown_field: 'required' })

    expect(toSessionError(serverError('app:invalid', details)).fields).toEqual({ name: 'Please check this field' })
  })

  it('still reports invalid when the details are missing or broken', () => {
    expect(toSessionError(serverError('app:invalid'))).toMatchObject({ code: 'invalid', fields: {} })
    expect(toSessionError(serverError('app:invalid', '{oops'))).toMatchObject({ code: 'invalid', fields: {} })
    expect(toSessionError(serverError('app:invalid', '[1]'))).toMatchObject({ code: 'invalid', fields: {} })
  })

  it.each([
    ['an unknown app code', serverError('app:teapot')],
    ['an unrelated server error', new RpcError('permission denied for function x', { status: 403, code: '42501' })],
    ['a network failure', new RpcError('Could not reach the server', { status: 0 })],
    ['a programming error', new TypeError('boom')],
    ['a thrown string', 'boom'],
  ])('maps %s to unavailable', (_label, thrown) => {
    expect(toSessionError(thrown).code).toBe('unavailable')
  })

  it('keeps a SessionApiError as it is', () => {
    const original = new SessionApiError('closed')

    expect(toSessionError(original)).toBe(original)
  })

  it('is applied to every call', async () => {
    const error = await failure(apiFailing(serverError('app:not_found')).closeSession('s1', 'tok'))

    expect(error.code).toBe('not_found')
  })
})
