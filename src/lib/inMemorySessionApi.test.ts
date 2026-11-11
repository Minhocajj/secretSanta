import { describe, expect, it } from 'vitest'
import { InMemorySessionApi } from './inMemorySessionApi'
import { describeSessionApiContract } from './sessionApiContract'

describeSessionApiContract('InMemorySessionApi', () => new InMemorySessionApi())

describe('InMemorySessionApi', () => {
  it('uses the injected id, token and clock', async () => {
    let counter = 0
    let current = new Date('2026-12-01T10:00:00.000Z')
    const api = new InMemorySessionApi({
      randomId: () => `session-${++counter}`,
      randomToken: () => `token-${counter}`,
      now: () => current,
    })

    const created = await api.createSession({ title: 'Party', description: '' })
    await api.closeSession(created.id, created.adminToken)
    current = new Date('2026-12-02T09:30:00.000Z')
    await api.markDrawStarted(created.id, created.adminToken)

    expect(created).toEqual({ id: 'session-1', adminToken: 'token-1' })
    const { session } = await api.getAdminView(created.id, created.adminToken)
    expect(session.createdAt).toBe('2026-12-01T10:00:00.000Z')
    expect(session.drawStartedAt).toBe('2026-12-02T09:30:00.000Z')
  })

  it('generates a UUID id and a 256-bit url-safe admin token by default', async () => {
    const created = await new InMemorySessionApi().createSession({ title: 'Party', description: '' })

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(created.adminToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('hands out copies, so callers cannot change what is stored', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken } = await api.createSession({ title: 'Party', description: '' })
    const added = await api.addParticipant(id, adminToken, { name: 'Alice', email: 'alice@example.com', gift: '' })

    added.name = 'Mallory'
    const view = await api.getAdminView(id, adminToken)
    view.participants[0].name = 'Eve'
    view.participants.pop()

    expect((await api.getAdminView(id, adminToken)).participants).toEqual([
      { id: added.id, name: 'Alice', email: 'alice@example.com', gift: '' },
    ])
  })
})
