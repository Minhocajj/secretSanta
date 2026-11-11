import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParticipantInput } from '../types'
import { RpcError } from './rpcClient'
import { hasErrors, normalizeInput, validateParticipant } from './validation'
import { createTestDatabase, type TestDatabase } from './testDatabase'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

interface Created {
  id: string
  admin_token: string
}

interface AdminView {
  session: { status: string; draw_started_at: string | null }
  participants: { id: number; name: string; email: string; gift: string }[]
}

const PUBLIC_FUNCTIONS = [
  'add_participant',
  'authorize_send',
  'close_session',
  'complete_session',
  'create_session',
  'delete_session',
  'get_admin_view',
  'get_public_session',
  'join_session',
  'mark_draw_started',
  'remove_participant',
  'reopen_session',
]

const PRIVATE_TABLES = ['participants', 'secrets', 'sessions', 'settings', 'throttle_hits']

let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(async () => {
  await database.reset()
})

afterAll(async () => {
  await database.db.close()
})

const createSession = async (title = 'Party') =>
  (await database.rpc('create_session', { p_title: title, p_description: '' })) as Created

const join = (id: string, fields: Partial<ParticipantInput> = {}) => {
  const { name = 'Alice', email = 'alice@example.com', gift = '' } = fields
  return database.rpc('join_session', { p_session_id: id, p_name: name, p_email: email, p_gift: gift })
}

const adminView = async ({ id, admin_token }: Created) =>
  (await database.rpc('get_admin_view', { p_session_id: id, p_admin_token: admin_token })) as AdminView

async function failure(promise: Promise<unknown>): Promise<RpcError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RpcError) return error
    throw error
  }
  throw new Error('Expected the call to fail')
}

const detailsOf = (error: RpcError): unknown => JSON.parse(error.details ?? 'null')

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function insertSession(
  overrides: { title?: string; description?: string; status?: string; drawStartedAt?: string | null } = {},
) {
  const { title = 'Party', description = '', status = 'open', drawStartedAt = null } = overrides
  const { rows } = await database.db.query<{ id: string }>(
    `insert into private.sessions (admin_token_hash, title, description, status, draw_started_at, expires_at)
     values (decode('00', 'hex'), $1, $2, $3, $4, now() + interval '1 day') returning id`,
    [title, description, status, drawStartedAt],
  )
  return rows[0].id
}

const insertParticipant = (sessionId: string, fields: Partial<ParticipantInput> = {}) => {
  const { name = 'Alice', email = 'alice@example.com', gift = '' } = fields
  return database.db.query(
    'insert into private.participants (session_id, name, email, gift) values ($1, $2, $3, $4)',
    [sessionId, name, email, gift],
  )
}

describe('access', () => {
  it('gives anon no direct access to any table', async () => {
    for (const table of PRIVATE_TABLES) {
      await expect(database.asAnon(`select * from private.${table}`)).rejects.toMatchObject({ code: '42501' })
    }
    await expect(
      database.asAnon("insert into private.sessions (admin_token_hash, title, expires_at) values ('\\x00', 'x', now())"),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(database.asAnon('select * from public.sessions')).rejects.toMatchObject({ code: '42P01' })
    await expect(database.asAnon('select * from public.participants')).rejects.toMatchObject({ code: '42P01' })
  })

  it('keeps the private functions out of reach', async () => {
    await expect(database.asAnon('select private.purge_expired()')).rejects.toMatchObject({ code: '42501' })

    const { rows } = await database.db.query<{ name: string; can: boolean }>(
      `select p.proname as name, has_function_privilege('anon', p.oid, 'execute') as can
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((row) => row.can)).toEqual([])
  })

  it('exposes exactly the intended functions and no tables in the public schema', async () => {
    const { rows: functions } = await database.db.query<{ name: string; can: boolean }>(
      `select p.proname as name, has_function_privilege('anon', p.oid, 'execute') as can
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`,
    )
    expect(functions.map((row) => row.name)).toEqual(PUBLIC_FUNCTIONS)
    expect(functions.every((row) => row.can)).toBe(true)

    const { rows: relations } = await database.db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')`,
    )
    expect(relations).toEqual([])
  })

  it('enables row level security on every private table', async () => {
    const { rows } = await database.db.query<{ name: string; rls: boolean }>(
      `select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'private' and c.relkind = 'r' order by 1`,
    )
    expect(rows.map((row) => row.name)).toEqual(PRIVATE_TABLES)
    expect(rows.every((row) => row.rls)).toBe(true)
  })

  it('answers a wrong admin token exactly like an unknown session', async () => {
    const { id } = await createSession()

    const wrongToken = await failure(database.rpc('get_admin_view', { p_session_id: id, p_admin_token: 'wrong' }))
    const unknownSession = await failure(
      database.rpc('get_admin_view', { p_session_id: crypto.randomUUID(), p_admin_token: 'wrong' }),
    )
    const malformedId = await failure(database.rpc('get_admin_view', { p_session_id: 'nope', p_admin_token: 'wrong' }))

    const shape = ({ status, code, message, details, hint }: RpcError) => ({ status, code, message, details, hint })
    expect(shape(wrongToken)).toEqual(shape(unknownSession))
    expect(shape(malformedId)).toEqual(shape(unknownSession))
    expect(wrongToken.message).toBe('app:not_found')
  })

  it('refuses every admin action with a wrong token and changes nothing', async () => {
    const created = await createSession()
    const wrong = { p_session_id: created.id, p_admin_token: 'wrong' }
    const calls: [string, Record<string, unknown>][] = [
      ['add_participant', { ...wrong, p_name: 'Eve', p_email: 'eve@example.com', p_gift: '' }],
      ['remove_participant', { ...wrong, p_participant_id: 1 }],
      ['close_session', wrong],
      ['reopen_session', wrong],
      ['mark_draw_started', wrong],
      ['complete_session', wrong],
      ['delete_session', wrong],
    ]

    for (const [fn, args] of calls) {
      expect((await failure(database.rpc(fn, args))).message, fn).toBe('app:not_found')
    }
    expect(await adminView(created)).toMatchObject({ session: { status: 'open' }, participants: [] })
  })

  it('stores only a hash of the admin token', async () => {
    const { admin_token } = await createSession()
    expect(admin_token).toMatch(/^[0-9a-f]{64}$/)

    const { rows } = await database.db.query<{ hash: string; row: string }>(
      "select encode(admin_token_hash, 'hex') as hash, row_to_json(s)::text as row from private.sessions s",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].hash).toBe(await sha256Hex(admin_token))
    expect(rows[0].row).not.toContain(admin_token)
  })
})

describe('rules enforced by the database itself', () => {
  it('rejects malformed sessions', async () => {
    const bad = [
      { title: '' },
      { title: 'x'.repeat(81) },
      { title: 'two  spaces' },
      { title: ' padded' },
      { title: 'bell\u0007' },
      { description: 'y'.repeat(501) },
      { description: 'bell\u0007' },
      { description: 'two  spaces' },
      { description: 'trailing \nspace' },
      { description: 'a\n\n\nb' },
      { description: 'a\r\nb' },
      { description: '\nleading' },
      { description: 'trailing\n' },
      { description: 'tab\tinside' },
      { status: 'bogus' },
      { drawStartedAt: '2026-01-01T00:00:00Z' },
    ]
    for (const overrides of bad) {
      await expect(insertSession(overrides), JSON.stringify(overrides)).rejects.toMatchObject({ code: '23514' })
    }
    await expect(insertSession({ title: 'x'.repeat(80), description: 'y'.repeat(500) })).resolves.toBeTypeOf('string')
    await expect(insertSession({ description: 'one line\nnext line\n\nafter a gap' })).resolves.toBeTypeOf('string')
  })

  it('tidies a note sent straight to create_session and keeps its line breaks', async () => {
    const created = (await database.rpc('create_session', {
      p_title: 'Party',
      p_description: '  Budget:  20 euro \r\n\r\n\r\n\r\n Gifts on Dec 20 \t\n',
    })) as Created

    const { rows } = await database.db.query<{ description: string }>(
      'select description from private.sessions where id = $1',
      [created.id],
    )

    expect(rows[0].description).toBe('Budget: 20 euro\n\nGifts on Dec 20')
  })

  it('still rejects other control characters in a note sent to create_session', async () => {
    const error = await failure(database.rpc('create_session', { p_title: 'Party', p_description: 'a\nb\u0007' }))

    expect(error.message).toBe('app:invalid')
    expect(detailsOf(error)).toEqual({ description: 'unsupported' })
  })

  it('rejects malformed participants', async () => {
    const id = await insertSession()
    const bad: Partial<ParticipantInput>[] = [
      { name: '' },
      { name: 'x'.repeat(61) },
      { name: 'two  spaces' },
      { name: 'bell\u0007' },
      { email: '' },
      { email: 'not-an-email' },
      { email: 'a@b' },
      { email: ' alice@example.com' },
      { email: `${'a'.repeat(243)}@example.com` },
      { gift: 'x'.repeat(501) },
      { gift: 'bell\u0007' },
      { gift: 'bell\nin a list\u0007' },
      { gift: 'two  spaces' },
      { gift: 'a\n\n\nb' },
      { gift: 'trailing\n' },
      { gift: 'a\r\nb' },
    ]
    for (const fields of bad) {
      await expect(insertParticipant(id, fields), JSON.stringify(fields)).rejects.toMatchObject({ code: '23514' })
    }
    await expect(insertParticipant(id, { name: 'x'.repeat(60), gift: 'y'.repeat(500) })).resolves.toBeDefined()
    await expect(
      insertParticipant(id, { email: 'lists@example.com', name: 'Lists', gift: '- a book\n- a [link](https://example.com)\n\n**thanks**' }),
    ).resolves.toBeDefined()
  })

  it('tidies a gift idea sent through join_session and keeps its line breaks', async () => {
    const { id } = await createSession()

    await join(id, { gift: '  - a book  \r\n\r\n\r\n\r\n - a scarf \t\n' })

    const { rows } = await database.db.query<{ gift: string }>('select gift from private.participants where session_id = $1', [id])
    expect(rows[0].gift).toBe('- a book\n\n- a scarf')
  })

  it('keeps names and emails unique per session, ignoring case', async () => {
    const first = await insertSession()
    const second = await insertSession()
    await insertParticipant(first, { name: 'Alice', email: 'alice@example.com' })

    await expect(insertParticipant(first, { name: 'ALICE', email: 'other@example.com' })).rejects.toMatchObject({
      code: '23505',
    })
    await expect(insertParticipant(first, { name: 'Bob', email: 'ALICE@example.com' })).rejects.toMatchObject({
      code: '23505',
    })
    await expect(insertParticipant(second, { name: 'Alice', email: 'alice@example.com' })).resolves.toBeDefined()
  })

  it('caps a session at 100 participants even for direct inserts', async () => {
    const id = await insertSession()
    await database.db.exec(`
      do $$
      begin
        for i in 1..100 loop
          insert into private.participants (session_id, name, email) values ('${id}', 'Person ' || i, 'p' || i || '@example.com');
        end loop;
      end $$;
    `)

    await expect(insertParticipant(id, { name: 'One too many', email: 'extra@example.com' })).rejects.toMatchObject({
      message: 'app:full',
    })
  })

  it('only allows the documented status transitions', async () => {
    const created = await createSession()
    const args = { p_session_id: created.id, p_admin_token: created.admin_token }
    const setStatus = (status: string) =>
      database.db.query('update private.sessions set status = $2 where id = $1', [created.id, status])

    await expect(setStatus('completed')).rejects.toMatchObject({ message: 'app:conflict' })
    await expect(
      database.db.query('update private.sessions set draw_started_at = now() where id = $1', [created.id]),
    ).rejects.toMatchObject({ message: 'app:conflict' })

    await database.rpc('close_session', args)
    await expect(setStatus('completed')).rejects.toMatchObject({ message: 'app:conflict' })

    await database.rpc('mark_draw_started', args)
    await expect(setStatus('open')).rejects.toMatchObject({ message: 'app:conflict' })
    await expect(
      database.db.query('update private.sessions set draw_started_at = null where id = $1', [created.id]),
    ).rejects.toMatchObject({ message: 'app:conflict' })

    await database.rpc('complete_session', args)
    await expect(setStatus('open')).rejects.toMatchObject({ message: 'app:conflict' })
    await expect(setStatus('closed')).rejects.toMatchObject({ message: 'app:conflict' })
  })

  it('never lets identity, token or expiry change', async () => {
    const { id } = await createSession()
    const updates = [
      'update private.sessions set id = gen_random_uuid() where id = $1',
      "update private.sessions set admin_token_hash = decode('ff', 'hex') where id = $1",
      "update private.sessions set expires_at = expires_at + interval '1 day' where id = $1",
      "update private.sessions set created_at = created_at - interval '1 day' where id = $1",
    ]
    for (const sql of updates) {
      await expect(database.db.query(sql, [id]), sql).rejects.toMatchObject({ message: 'app:conflict' })
    }
  })

  it('refuses joins to closed and completed sessions', async () => {
    const created = await createSession()
    const args = { p_session_id: created.id, p_admin_token: created.admin_token }

    await database.rpc('close_session', args)
    expect((await failure(join(created.id))).message).toBe('app:closed')

    await database.rpc('mark_draw_started', args)
    await database.rpc('complete_session', args)
    expect((await failure(join(created.id, { name: 'Bob', email: 'bob@example.com' }))).message).toBe('app:closed')
  })
})

describe('normalizing and validating inside the database', () => {
  it('stores trimmed, single-spaced text', async () => {
    const created = await createSession('  Office   party ')
    await join(created.id, { name: ' Alice \t Smith ', email: ' alice@example.com ', gift: ' a   book ' })

    expect((await adminView(created)).participants).toEqual([
      expect.objectContaining({ name: 'Alice Smith', email: 'alice@example.com', gift: 'a book' }),
    ])
    const { rows } = await database.db.query<{ title: string }>('select title from private.sessions')
    expect(rows).toEqual([{ title: 'Office party' }])
  })

  it('reports every invalid session field at once', async () => {
    const error = await failure(database.rpc('create_session', { p_title: '', p_description: 'y'.repeat(501) }))

    expect(error.message).toBe('app:invalid')
    expect(detailsOf(error)).toEqual({ title: 'required', description: 'too_long' })
  })

  it('reports every invalid participant field at once', async () => {
    const { id } = await createSession()
    const error = await failure(join(id, { name: '', email: 'bad', gift: 'x'.repeat(501) }))

    expect(error.message).toBe('app:invalid')
    expect(detailsOf(error)).toEqual({ name: 'required', email: 'invalid', gift: 'too_long' })
  })

  it('reports duplicates as taken', async () => {
    const { id } = await createSession()
    await join(id)

    const error = await failure(join(id, { name: ' alice ', email: 'ALICE@example.com' }))
    expect(detailsOf(error)).toEqual({ name: 'taken', email: 'taken' })
  })

  it('answers malformed ids and empty tokens with not found', async () => {
    const { id } = await createSession()

    expect((await failure(database.rpc('get_public_session', { p_session_id: 'not-a-uuid' }))).message).toBe('app:not_found')
    expect((await failure(database.rpc('get_admin_view', { p_session_id: id, p_admin_token: '' }))).message).toBe('app:not_found')
  })
})

describe('agreement with the client-side validators', () => {
  const longLabel = (length: number) => 'x'.repeat(length)
  const cases: ParticipantInput[] = [
    { name: 'Alice', email: 'alice@example.com', gift: '' },
    { name: 'x'.repeat(60), email: 'a@b.co', gift: 'x'.repeat(500) },
    { name: 'Alice', email: 'a@b.co', gift: '- a book\n- a scarf' },
    { name: 'Alice', email: 'a@b.co', gift: '  one  \r\n\r\n\r\n\r\n two  ' },
    { name: 'Alice', email: 'a@b.co', gift: 'bell\nin a list\u0007' },
    { name: 'Alice', email: 'a@b.co', gift: `${'x\n'.repeat(250)}x` },
    { name: 'x'.repeat(61), email: 'a@b.co', gift: '' },
    { name: '', email: '', gift: '' },
    { name: '   ', email: 'a@b.co', gift: '' },
    { name: 'Bell\u0007', email: 'a@b.co', gift: '' },
    { name: 'Alice', email: 'a@b.co', gift: 'tab\there' },
    { name: 'Alice', email: 'a@b.co', gift: 'x'.repeat(501) },
    { name: 'Alice', email: 'a@b.co', gift: 'del\u007f' },
    { name: 'Alice', email: 'first.last+tag@example.com', gift: '' },
    { name: 'Alice', email: "o'brien@example.org", gift: '' },
    { name: 'Alice', email: 'a+b=c?d@example.com', gift: '' },
    { name: 'Alice', email: 'x@sub.domain.example.com', gift: '' },
    { name: 'Alice', email: 'UPPER@EXAMPLE.COM', gift: '' },
    { name: 'Alice', email: 'plain', gift: '' },
    { name: 'Alice', email: '@example.com', gift: '' },
    { name: 'Alice', email: 'a@', gift: '' },
    { name: 'Alice', email: 'a@b', gift: '' },
    { name: 'Alice', email: 'a@b.', gift: '' },
    { name: 'Alice', email: 'a b@example.com', gift: '' },
    { name: 'Alice', email: 'a(b)@example.com', gift: '' },
    { name: 'Alice', email: '"quoted"@example.com', gift: '' },
    { name: 'Alice', email: 'a@-b.com', gift: '' },
    { name: 'Alice', email: 'a@b-.com', gift: '' },
    { name: 'Alice', email: 'a@@b.com', gift: '' },
    { name: 'Alice', email: `a@${longLabel(63)}.com`, gift: '' },
    { name: 'Alice', email: `a@${longLabel(64)}.com`, gift: '' },
    { name: 'Alice', email: `${'a'.repeat(242)}@example.com`, gift: '' },
    { name: 'Alice', email: `${'a'.repeat(243)}@example.com`, gift: '' },
  ]

  it.each(cases.map((input) => [JSON.stringify(input).slice(0, 90), input] as const))(
    'accepts and rejects the same input: %s',
    async (_label, input) => {
      await database.setSetting('create_per_hour_per_ip', 100_000)
      const { id } = await createSession()
      const normalized = normalizeInput(input)
      const expected = validateParticipant(normalized, [])

      const outcome = await join(id, normalized).then(
        () => null,
        (error: unknown) => error,
      )
      if (hasErrors(expected)) {
        expect(outcome).toBeInstanceOf(RpcError)
        const error = outcome as RpcError
        expect(error.message).toBe('app:invalid')
        expect(Object.keys(detailsOf(error) as object).sort()).toEqual(Object.keys(expected).sort())
      } else {
        expect(outcome).toBeNull()
      }
    },
  )
})

describe('throttling', () => {
  it('limits session creation per client address', async () => {
    await database.setSetting('create_per_hour_per_ip', 3)
    for (let i = 0; i < 3; i++) await createSession(`Party ${i}`)

    expect((await failure(database.rpc('create_session', { p_title: 'One more', p_description: '' }))).message).toBe(
      'app:rate_limited',
    )

    database.setHeaders({ 'cf-connecting-ip': '198.51.100.20' })
    await expect(createSession('Someone else')).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('cannot be dodged by forging the first X-Forwarded-For entry', async () => {
    await database.setSetting('create_per_hour_per_ip', 2)
    const forged = (first: string) => database.setHeaders({ 'x-forwarded-for': `${first}, 203.0.113.9` })

    forged('1.1.1.1')
    await createSession()
    forged('2.2.2.2')
    await createSession()
    forged('3.3.3.3')
    expect((await failure(database.rpc('create_session', { p_title: 'x', p_description: '' }))).message).toBe(
      'app:rate_limited',
    )
  })

  it('prefers cf-connecting-ip over X-Forwarded-For', async () => {
    await database.setSetting('create_per_hour_per_ip', 1)
    database.setHeaders({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1' })
    await createSession()

    database.setHeaders({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.2' })
    expect((await failure(database.rpc('create_session', { p_title: 'x', p_description: '' }))).message).toBe(
      'app:rate_limited',
    )
  })

  it('shares one bucket when no address is known', async () => {
    await database.setSetting('create_per_hour_per_ip', 2)
    database.setHeaders(null)
    await createSession()
    await createSession()

    expect((await failure(database.rpc('create_session', { p_title: 'x', p_description: '' }))).message).toBe(
      'app:rate_limited',
    )
  })

  it('limits joins per client address', async () => {
    await database.setSetting('join_per_hour_per_ip', 2)
    const { id } = await createSession()

    await join(id, { name: 'A', email: 'a@example.com' })
    await join(id, { name: 'B', email: 'b@example.com' })
    expect((await failure(join(id, { name: 'C', email: 'c@example.com' }))).message).toBe('app:rate_limited')
  })

  it('only counts requests that succeed', async () => {
    await database.setSetting('join_per_hour_per_ip', 2)
    const { id } = await createSession()

    for (let i = 0; i < 5; i++) expect((await failure(join(id, { email: 'bad' }))).message).toBe('app:invalid')
    await expect(join(id, { name: 'A', email: 'a@example.com' })).resolves.toBeNull()
  })

  it('caps the number of live sessions', async () => {
    await database.setSetting('max_sessions', 2)
    await createSession()
    const second = await createSession()

    expect((await failure(database.rpc('create_session', { p_title: 'x', p_description: '' }))).message).toBe(
      'app:rate_limited',
    )

    await database.rpc('delete_session', { p_session_id: second.id, p_admin_token: second.admin_token })
    await expect(createSession()).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('never stores a raw address', async () => {
    await createSession()

    const { rows } = await database.db.query<{ bucket: string }>('select bucket from private.throttle_hits')
    expect(rows).toHaveLength(1)
    expect(rows[0].bucket).toMatch(/^create:[0-9a-f]{64}$/)
    expect(rows[0].bucket).not.toContain('203.0.113.7')
  })
})

describe('expiry', () => {
  it('treats expired sessions as unknown and purges them with their participants', async () => {
    const created = await createSession()
    await join(created.id)
    await database.db.exec('alter table private.sessions disable trigger sessions_guard_update')
    await database.db.exec("update private.sessions set expires_at = now() - interval '1 minute'")
    await database.db.exec('alter table private.sessions enable trigger sessions_guard_update')

    expect((await failure(database.rpc('get_public_session', { p_session_id: created.id }))).message).toBe('app:not_found')
    expect((await failure(join(created.id, { name: 'Bob', email: 'bob@example.com' }))).message).toBe('app:not_found')
    expect((await failure(database.rpc('get_admin_view', { p_session_id: created.id, p_admin_token: created.admin_token }))).message).toBe(
      'app:not_found',
    )

    const { rows } = await database.db.query<{ deleted: number }>('select private.purge_expired() as deleted')
    expect(rows[0].deleted).toBe(1)
    expect((await database.db.query('select 1 from private.sessions')).rows).toEqual([])
    expect((await database.db.query('select 1 from private.participants')).rows).toEqual([])
  })

  it('expires new sessions after the configured retention', async () => {
    await database.setSetting('retention_days', 0)
    const created = await createSession()

    expect((await failure(database.rpc('get_public_session', { p_session_id: created.id }))).message).toBe('app:not_found')
  })

  it('keeps live sessions and drops stale throttle counters', async () => {
    const created = await createSession()
    await database.db.exec("insert into private.throttle_hits (bucket, window_start, hits) values ('old', now() - interval '3 days', 1)")

    const { rows } = await database.db.query<{ deleted: number }>('select private.purge_expired() as deleted')

    expect(rows[0].deleted).toBe(0)
    expect(await adminView(created)).toMatchObject({ session: { status: 'open' } })
    expect((await database.db.query('select 1 from private.throttle_hits where bucket = $1', ['old'])).rows).toEqual([])
    expect((await database.db.query('select 1 from private.throttle_hits')).rows).toHaveLength(1)
  })
})
