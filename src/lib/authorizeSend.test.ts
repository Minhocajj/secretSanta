import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcError } from './rpcClient'
import { createTestDatabase, type TestDatabase } from './testDatabase'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

interface Created {
  id: string
  admin_token: string
}

interface Listed {
  participants: { id: number; name: string; email: string }[]
}

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

const join = (id: string, name: string, email: string) =>
  database.rpc('join_session', { p_session_id: id, p_name: name, p_email: email, p_gift: '' })

const adminArgs = (created: Created) => ({ p_session_id: created.id, p_admin_token: created.admin_token })

const listParticipants = async (created: Created) =>
  ((await database.rpc('get_admin_view', adminArgs(created))) as Listed).participants

async function failure(promise: Promise<unknown>): Promise<RpcError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RpcError) return error
    throw error
  }
  throw new Error('Expected the call to fail')
}

async function drawnSession(people = 2) {
  const created = await createSession()
  for (let i = 0; i < people; i++) await join(created.id, `Person ${i}`, `p${i}@example.com`)
  const args = adminArgs(created)
  await database.rpc('close_session', args)
  await database.rpc('mark_draw_started', args)
  return { created, args, participants: await listParticipants(created) }
}

const authorize = (args: Record<string, unknown>, participantId: number) =>
  database.rpc('authorize_send', { ...args, p_participant_id: participantId })

async function sendCount(participantId: number) {
  const { rows } = await database.db.query<{ send_count: number }>(
    'select send_count from private.participants where id = $1',
    [participantId],
  )
  return rows[0].send_count
}

describe('authorize_send', () => {
  it('returns only the recipient from the database and counts the send', async () => {
    const { args, participants } = await drawnSession()

    expect(await authorize(args, participants[0].id)).toEqual({ name: 'Person 0', email: 'p0@example.com' })
    expect(await sendCount(participants[0].id)).toBe(1)
    expect(await sendCount(participants[1].id)).toBe(0)
  })

  it('answers a wrong token like an unknown session', async () => {
    const { created, participants } = await drawnSession()

    const wrong = await failure(authorize({ p_session_id: created.id, p_admin_token: 'wrong' }, participants[0].id))

    expect(wrong.message).toBe('app:not_found')
    expect(await sendCount(participants[0].id)).toBe(0)
  })

  it('refuses a participant that is unknown or belongs to another session', async () => {
    const { args, participants } = await drawnSession()
    const other = await createSession('Other')
    await join(other.id, 'Zed', 'zed@example.com')
    const [stranger] = await listParticipants(other)

    expect((await failure(authorize(args, 999_999))).message).toBe('app:not_found')
    expect((await failure(authorize(args, stranger.id))).message).toBe('app:not_found')
    expect(await sendCount(stranger.id)).toBe(0)
    expect(await sendCount(participants[0].id)).toBe(0)
  })

  it('refuses until the session is closed with the draw started', async () => {
    const created = await createSession()
    await join(created.id, 'Alice', 'alice@example.com')
    const args = adminArgs(created)
    const [participant] = await listParticipants(created)

    expect((await failure(authorize(args, participant.id))).message).toBe('app:conflict')

    await database.rpc('close_session', args)
    expect((await failure(authorize(args, participant.id))).message).toBe('app:conflict')

    await database.rpc('mark_draw_started', args)
    await expect(authorize(args, participant.id)).resolves.toMatchObject({ name: 'Alice' })
  })

  it('refuses once the session is completed', async () => {
    const { args, participants } = await drawnSession()
    await database.rpc('complete_session', args)

    expect((await failure(authorize(args, participants[0].id))).message).toBe('app:conflict')
  })

  it('caps the sends per participant and does not count a refused send', async () => {
    await database.setSetting('send_per_participant', 2)
    const { args, participants } = await drawnSession()

    await authorize(args, participants[0].id)
    await authorize(args, participants[0].id)
    expect((await failure(authorize(args, participants[0].id))).message).toBe('app:rate_limited')

    expect(await sendCount(participants[0].id)).toBe(2)
    await expect(authorize(args, participants[1].id)).resolves.toMatchObject({ name: 'Person 1' })
  })

  it('caps the sends per day and does not count a refused send', async () => {
    await database.setSetting('send_per_day', 2)
    const { args, participants } = await drawnSession()
    await authorize(args, participants[0].id)
    await authorize(args, participants[1].id)

    expect((await failure(authorize(args, participants[0].id))).message).toBe('app:rate_limited')

    const { rows } = await database.db.query<{ hits: number }>(
      "select hits from private.throttle_hits where bucket = 'send:all'",
    )
    expect(rows).toEqual([{ hits: 2 }])
  })
})
