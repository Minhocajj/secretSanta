import type { Participant, ParticipantInput, SessionInput } from '../types'
import {
  SessionApiError,
  type AdminSession,
  type AdminView,
  type CreatedSession,
  type PublicSession,
  type SessionApi,
  type SessionStatus,
} from './sessionApi'
import { LIMITS, hasErrors, normalizeInput, normalizeSession, validateParticipant, validateSession } from './validation'

interface SessionRecord {
  id: string
  adminToken: string
  title: string
  description: string
  status: SessionStatus
  createdAt: string
  drawStartedAt: string | null
  participants: Participant[]
  nextParticipantId: number
}

export interface InMemorySessionApiOptions {
  randomId?: () => string
  randomToken?: () => string
  now?: () => Date
}

const defaultRandomId = () => crypto.randomUUID()

const defaultRandomToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const defaultNow = () => new Date()

const toPublic = ({ id, title, description, status, participants }: SessionRecord): PublicSession => ({
  id,
  title,
  description,
  status,
  full: participants.length >= LIMITS.participants,
})

const toAdmin = (record: SessionRecord): AdminSession => ({
  ...toPublic(record),
  createdAt: record.createdAt,
  drawStartedAt: record.drawStartedAt,
})

export class InMemorySessionApi implements SessionApi {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly randomId: () => string
  private readonly randomToken: () => string
  private readonly now: () => Date

  constructor({ randomId = defaultRandomId, randomToken = defaultRandomToken, now = defaultNow }: InMemorySessionApiOptions = {}) {
    this.randomId = randomId
    this.randomToken = randomToken
    this.now = now
  }

  async createSession(input: SessionInput): Promise<CreatedSession> {
    const errors = validateSession(input)
    if (hasErrors(errors)) throw new SessionApiError('invalid', errors)

    const { title, description } = normalizeSession(input)
    const id = this.randomId()
    const adminToken = this.randomToken()
    this.sessions.set(id, {
      id,
      adminToken,
      title,
      description,
      status: 'open',
      createdAt: this.now().toISOString(),
      drawStartedAt: null,
      participants: [],
      nextParticipantId: 1,
    })
    return { id, adminToken }
  }

  async getPublicSession(id: string): Promise<PublicSession> {
    return toPublic(this.find(id))
  }

  async join(id: string, input: ParticipantInput): Promise<void> {
    this.insert(this.find(id), input)
  }

  async getAdminView(id: string, adminToken: string): Promise<AdminView> {
    const record = this.authorize(id, adminToken)
    return { session: toAdmin(record), participants: record.participants.map((participant) => ({ ...participant })) }
  }

  async addParticipant(id: string, adminToken: string, input: ParticipantInput): Promise<Participant> {
    return this.insert(this.authorize(id, adminToken), input)
  }

  async removeParticipant(id: string, adminToken: string, participantId: number): Promise<void> {
    const record = this.authorize(id, adminToken)
    if (record.status !== 'open') throw new SessionApiError('closed')
    const index = record.participants.findIndex((participant) => participant.id === participantId)
    if (index < 0) throw new SessionApiError('not_found')
    record.participants.splice(index, 1)
  }

  async closeSession(id: string, adminToken: string): Promise<void> {
    const record = this.authorize(id, adminToken)
    if (record.status === 'completed') throw new SessionApiError('conflict')
    record.status = 'closed'
  }

  async reopenSession(id: string, adminToken: string): Promise<void> {
    const record = this.authorize(id, adminToken)
    if (record.status === 'completed' || record.drawStartedAt) throw new SessionApiError('conflict')
    record.status = 'open'
  }

  async markDrawStarted(id: string, adminToken: string): Promise<void> {
    const record = this.authorize(id, adminToken)
    if (record.status !== 'closed') throw new SessionApiError('conflict')
    record.drawStartedAt ??= this.now().toISOString()
  }

  async completeSession(id: string, adminToken: string): Promise<void> {
    const record = this.authorize(id, adminToken)
    if (record.status === 'completed') return
    if (record.status !== 'closed' || !record.drawStartedAt) throw new SessionApiError('conflict')
    record.status = 'completed'
  }

  async deleteSession(id: string, adminToken: string): Promise<void> {
    this.authorize(id, adminToken)
    this.sessions.delete(id)
  }

  private find(id: string): SessionRecord {
    const record = this.sessions.get(id)
    if (!record) throw new SessionApiError('not_found')
    return record
  }

  private authorize(id: string, adminToken: string): SessionRecord {
    const record = this.sessions.get(id)
    if (!record || record.adminToken !== adminToken) throw new SessionApiError('not_found')
    return record
  }

  private insert(record: SessionRecord, input: ParticipantInput): Participant {
    if (record.status !== 'open') throw new SessionApiError('closed')
    if (record.participants.length >= LIMITS.participants) throw new SessionApiError('full')

    const errors = validateParticipant(input, record.participants)
    if (hasErrors(errors)) throw new SessionApiError('invalid', errors)

    const participant: Participant = { id: record.nextParticipantId++, ...normalizeInput(input) }
    record.participants.push(participant)
    return { ...participant }
  }
}
