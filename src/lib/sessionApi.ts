import type { Participant, ParticipantInput, SessionInput } from '../types'
import { LIMITS, UNEXPECTED_FORM_ERROR, hasErrors, type FormErrors } from './validation'

export type SessionStatus = 'open' | 'closed' | 'completed'

export interface PublicSession {
  id: string
  title: string
  description: string
  status: SessionStatus
  full: boolean
}

export interface AdminSession extends PublicSession {
  createdAt: string
  drawStartedAt: string | null
}

export interface AdminView {
  session: AdminSession
  participants: Participant[]
}

export interface CreatedSession {
  id: string
  adminToken: string
}

export type SessionErrorCode = 'not_found' | 'closed' | 'full' | 'invalid' | 'conflict' | 'rate_limited' | 'unavailable'

export type FieldErrors = Partial<Record<keyof SessionInput | keyof ParticipantInput, string>>

const DEFAULT_MESSAGES: Record<SessionErrorCode, string> = {
  not_found: 'This session does not exist or the link is wrong',
  closed: 'This session is closed',
  full: `This session is full: at most ${LIMITS.participants} participants are supported`,
  invalid: 'Please check the highlighted fields',
  conflict: 'That is not possible in the current state of the session',
  rate_limited: 'Too many requests. Please wait a moment and try again',
  unavailable: 'Could not reach the server. Check your internet connection and try again',
}

export class SessionApiError extends Error {
  readonly code: SessionErrorCode
  readonly fields: FieldErrors

  constructor(code: SessionErrorCode, fields: FieldErrors = {}, message = DEFAULT_MESSAGES[code]) {
    super(message)
    this.name = 'SessionApiError'
    this.code = code
    this.fields = fields
  }
}

export interface SessionApi {
  createSession(input: SessionInput): Promise<CreatedSession>
  getPublicSession(id: string): Promise<PublicSession>
  join(id: string, input: ParticipantInput): Promise<void>
  getAdminView(id: string, adminToken: string): Promise<AdminView>
  addParticipant(id: string, adminToken: string, input: ParticipantInput): Promise<Participant>
  removeParticipant(id: string, adminToken: string, participantId: number): Promise<void>
  closeSession(id: string, adminToken: string): Promise<void>
  reopenSession(id: string, adminToken: string): Promise<void>
  markDrawStarted(id: string, adminToken: string): Promise<void>
  completeSession(id: string, adminToken: string): Promise<void>
  deleteSession(id: string, adminToken: string): Promise<void>
}

const PARTICIPANT_FIELDS = ['name', 'email', 'gift'] as const

export function toFormErrors(error: unknown): FormErrors {
  if (!(error instanceof SessionApiError)) return { form: UNEXPECTED_FORM_ERROR }

  const errors: FormErrors = {}
  for (const field of PARTICIPANT_FIELDS) {
    const message = error.fields[field]
    if (message) errors[field] = message
  }
  return hasErrors(errors) ? errors : { form: error.message }
}
