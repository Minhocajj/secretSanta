import { describe, expect, it } from 'vitest'
import type { ParticipantInput } from '../types'
import { SessionApiError, type SessionApi, type SessionErrorCode } from './sessionApi'
import { LIMITS, SESSION_LIMITS } from './validation'

const ALICE: ParticipantInput = { name: 'Alice', email: 'alice@example.com', gift: 'a red scarf' }
const BOB: ParticipantInput = { name: 'Bob', email: 'bob@example.com', gift: '' }
const CAROL: ParticipantInput = { name: 'Carol', email: 'carol@example.com', gift: '' }

const person = (index: number): ParticipantInput => ({
  name: `Person ${index}`,
  email: `person${index}@example.com`,
  gift: '',
})

async function rejection(promise: Promise<unknown>): Promise<SessionApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof SessionApiError) return error
    throw error
  }
  throw new Error('Expected the call to be rejected')
}

async function expectCode(promise: Promise<unknown>, code: SessionErrorCode) {
  expect((await rejection(promise)).code).toBe(code)
}

export function describeSessionApiContract(label: string, createApi: () => SessionApi) {
  async function startSession(title = 'Office party') {
    const api = createApi()
    const { id, adminToken } = await api.createSession({ title, description: 'Budget: 20 euro' })
    return { api, id, adminToken }
  }

  describe(`${label} fulfils the SessionApi contract`, () => {
    describe('creating and reading sessions', () => {
      it('creates an open session that anyone with the id can read, without participants or token', async () => {
        const api = createApi()
        const { id } = await api.createSession({ title: '  Office   party ', description: ' Budget: 20 euro ' })

        expect(await api.getPublicSession(id)).toEqual({
          id,
          title: 'Office party',
          description: 'Budget: 20 euro',
          status: 'open',
          full: false,
        })
      })

      it('keeps the line breaks of the note, tidied the same way everywhere', async () => {
        const api = createApi()
        const { id } = await api.createSession({
          title: 'Party',
          description: '  Budget:  20 euro \r\n\r\n\r\n\r\n Gifts on Dec 20 \t\n',
        })

        expect((await api.getPublicSession(id)).description).toBe('Budget: 20 euro\n\nGifts on Dec 20')
      })

      it('keeps the line breaks and formatting marks of a gift idea, tidied the same way everywhere', async () => {
        const { api, id, adminToken } = await startSession()

        await api.join(id, {
          name: 'Alice',
          email: 'alice@example.com',
          gift: '  **Wishlist**  \r\n\r\n\r\n\r\n- a book \t\n- [socks](https://example.com/s)\n',
        })

        const { participants } = await api.getAdminView(id, adminToken)
        expect(participants[0].gift).toBe('**Wishlist**\n\n- a book\n- [socks](https://example.com/s)')
      })

      it('rejects other control characters in the note', async () => {
        const api = createApi()

        const error = await rejection(api.createSession({ title: 'Party', description: 'a\nb\u0007' }))

        expect(error.code).toBe('invalid')
        expect(error.fields.description).toContain('unsupported')
      })

      it('gives every session its own id and admin token', async () => {
        const api = createApi()
        const first = await api.createSession({ title: 'One', description: '' })
        const second = await api.createSession({ title: 'Two', description: '' })

        expect(second.id).not.toBe(first.id)
        expect(second.adminToken).not.toBe(first.adminToken)
      })

      it('rejects invalid session input with per-field messages', async () => {
        const api = createApi()

        const missing = await rejection(api.createSession({ title: '   ', description: '' }))
        expect(missing.code).toBe('invalid')
        expect(missing.fields.title).toBe('Title is required')

        const tooLong = await rejection(
          api.createSession({
            title: 'x'.repeat(SESSION_LIMITS.title + 1),
            description: 'y'.repeat(SESSION_LIMITS.description + 1),
          }),
        )
        expect(tooLong.fields.title).toContain('at most')
        expect(tooLong.fields.description).toContain('at most')
      })

      it('reports status and timestamps in the admin view', async () => {
        const { api, id, adminToken } = await startSession('Team lunch')

        const { session } = await api.getAdminView(id, adminToken)

        expect(session).toMatchObject({ id, title: 'Team lunch', status: 'open', full: false, drawStartedAt: null })
        expect(Number.isNaN(Date.parse(session.createdAt))).toBe(false)
      })
    })

    describe('access', () => {
      it('answers an unknown session and a wrong admin token the same way', async () => {
        const { api, id, adminToken } = await startSession()

        const unknown = await rejection(api.getPublicSession('no-such-session'))
        const wrongToken = await rejection(api.getAdminView(id, 'wrong-token'))
        const wrongSession = await rejection(api.getAdminView('no-such-session', adminToken))

        expect(unknown.code).toBe('not_found')
        expect(wrongToken.code).toBe('not_found')
        expect(wrongSession.code).toBe('not_found')
        expect(wrongToken.message).toBe(wrongSession.message)
      })

      it('rejects every admin call that carries a wrong token', async () => {
        const { api, id } = await startSession()
        const calls = [
          () => api.getAdminView(id, 'wrong'),
          () => api.addParticipant(id, 'wrong', ALICE),
          () => api.removeParticipant(id, 'wrong', 1),
          () => api.closeSession(id, 'wrong'),
          () => api.reopenSession(id, 'wrong'),
          () => api.markDrawStarted(id, 'wrong'),
          () => api.completeSession(id, 'wrong'),
          () => api.deleteSession(id, 'wrong'),
        ]

        for (const call of calls) await expectCode(call(), 'not_found')
      })
    })

    describe('joining', () => {
      it('stores normalized participants in join order, visible only through the admin view', async () => {
        const { api, id, adminToken } = await startSession()

        await api.join(id, { name: '  Alice  ', email: ' alice@example.com ', gift: ' a   red scarf ' })
        await api.join(id, BOB)
        const { participants } = await api.getAdminView(id, adminToken)

        expect(participants.map(({ name, email, gift }) => ({ name, email, gift }))).toEqual([ALICE, BOB])
        expect(new Set(participants.map(({ id: participantId }) => participantId)).size).toBe(2)
      })

      it('rejects invalid input with per-field messages and stores nothing', async () => {
        const { api, id, adminToken } = await startSession()

        const error = await rejection(api.join(id, { name: ' ', email: 'not-an-email', gift: '' }))

        expect(error.code).toBe('invalid')
        expect(error.fields.name).toBe('Name is required')
        expect(error.fields.email).toBe('Enter a valid email address')
        expect((await api.getAdminView(id, adminToken)).participants).toEqual([])
      })

      it('rejects a duplicate name or email regardless of case', async () => {
        const { api, id } = await startSession()
        await api.join(id, ALICE)

        const sameName = await rejection(api.join(id, { name: ' ALICE ', email: 'other@example.com', gift: '' }))
        const sameEmail = await rejection(api.join(id, { name: 'Alicia', email: 'Alice@Example.com', gift: '' }))

        expect(sameName.code).toBe('invalid')
        expect(sameName.fields.name).toBe('Someone with this name is already on the list')
        expect(sameEmail.code).toBe('invalid')
        expect(sameEmail.fields.email).toBe('This email is already on the list')
      })

      it('stops at the participant limit and reports the session as full', async () => {
        const { api, id, adminToken } = await startSession()
        for (let index = 1; index <= LIMITS.participants; index++) await api.addParticipant(id, adminToken, person(index))

        expect((await api.getPublicSession(id)).full).toBe(true)
        await expectCode(api.join(id, ALICE), 'full')

        const { participants } = await api.getAdminView(id, adminToken)
        await api.removeParticipant(id, adminToken, participants[0].id)
        expect((await api.getPublicSession(id)).full).toBe(false)
        await api.join(id, ALICE)
      })

      it('refuses joins while the session is closed and accepts them again once reopened', async () => {
        const { api, id, adminToken } = await startSession()
        await api.closeSession(id, adminToken)

        await expectCode(api.join(id, ALICE), 'closed')
        expect((await api.getPublicSession(id)).status).toBe('closed')

        await api.reopenSession(id, adminToken)
        await api.join(id, ALICE)
        expect((await api.getAdminView(id, adminToken)).participants).toHaveLength(1)
      })
    })

    describe('managing participants as the admin', () => {
      it('adds and removes participants while the session is open', async () => {
        const { api, id, adminToken } = await startSession()

        const alice = await api.addParticipant(id, adminToken, ALICE)
        const bob = await api.addParticipant(id, adminToken, BOB)
        expect(alice).toEqual({ id: alice.id, ...ALICE })
        expect(bob.id).not.toBe(alice.id)

        await api.removeParticipant(id, adminToken, alice.id)
        expect((await api.getAdminView(id, adminToken)).participants).toEqual([bob])
        await expectCode(api.removeParticipant(id, adminToken, alice.id), 'not_found')
      })

      it('applies the same validation as joining', async () => {
        const { api, id, adminToken } = await startSession()
        await api.addParticipant(id, adminToken, ALICE)

        const error = await rejection(api.addParticipant(id, adminToken, { ...BOB, email: 'ALICE@example.com' }))

        expect(error.code).toBe('invalid')
        expect(error.fields.email).toBe('This email is already on the list')
      })

      it('freezes the list once the session is closed', async () => {
        const { api, id, adminToken } = await startSession()
        const alice = await api.addParticipant(id, adminToken, ALICE)
        await api.closeSession(id, adminToken)

        await expectCode(api.addParticipant(id, adminToken, BOB), 'closed')
        await expectCode(api.removeParticipant(id, adminToken, alice.id), 'closed')
        expect((await api.getAdminView(id, adminToken)).participants).toEqual([alice])
      })
    })

    describe('lifecycle', () => {
      it('closes idempotently', async () => {
        const { api, id, adminToken } = await startSession()

        await api.closeSession(id, adminToken)
        await api.closeSession(id, adminToken)

        expect((await api.getPublicSession(id)).status).toBe('closed')
      })

      it('only completes a session after its draw started, and then locks it for good', async () => {
        const { api, id, adminToken } = await startSession()
        await api.addParticipant(id, adminToken, ALICE)
        await api.addParticipant(id, adminToken, BOB)

        await expectCode(api.markDrawStarted(id, adminToken), 'conflict')
        await expectCode(api.completeSession(id, adminToken), 'conflict')

        await api.closeSession(id, adminToken)
        await expectCode(api.completeSession(id, adminToken), 'conflict')

        await api.markDrawStarted(id, adminToken)
        const startedAt = (await api.getAdminView(id, adminToken)).session.drawStartedAt
        expect(startedAt).not.toBeNull()
        await api.markDrawStarted(id, adminToken)
        expect((await api.getAdminView(id, adminToken)).session.drawStartedAt).toBe(startedAt)
        await expectCode(api.reopenSession(id, adminToken), 'conflict')

        await api.completeSession(id, adminToken)
        await api.completeSession(id, adminToken)
        expect((await api.getPublicSession(id)).status).toBe('completed')

        await expectCode(api.join(id, CAROL), 'closed')
        await expectCode(api.closeSession(id, adminToken), 'conflict')
        await expectCode(api.reopenSession(id, adminToken), 'conflict')
      })

      it('deletes a session together with its participants', async () => {
        const { api, id, adminToken } = await startSession()
        await api.addParticipant(id, adminToken, ALICE)

        await api.deleteSession(id, adminToken)

        await expectCode(api.getPublicSession(id), 'not_found')
        await expectCode(api.getAdminView(id, adminToken), 'not_found')
        await expectCode(api.join(id, BOB), 'not_found')
        await expectCode(api.deleteSession(id, adminToken), 'not_found')
      })
    })
  })
}
