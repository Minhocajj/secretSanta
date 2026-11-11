import type { Participant, ParticipantInput, SessionInput } from '../types'
import { RpcError, type RpcClient } from './rpcClient'
import {
  SessionApiError,
  type AdminSession,
  type AdminView,
  type CreatedSession,
  type FieldErrors,
  type PublicSession,
  type SessionApi,
  type SessionErrorCode,
  type SessionStatus,
} from './sessionApi'
import {
  FALLBACK_FIELD_MESSAGE,
  fieldMessage,
  normalizeInput,
  normalizeSession,
  type FieldReason,
  type MessageField,
} from './validation'

const APP_ERROR_PREFIX = 'app:'
const SERVER_ERROR_CODES: readonly SessionErrorCode[] = ['not_found', 'closed', 'full', 'invalid', 'conflict', 'rate_limited']
const STATUSES: readonly SessionStatus[] = ['open', 'closed', 'completed']
const FIELDS: readonly MessageField[] = ['name', 'email', 'gift', 'title', 'description']
const REASONS: readonly FieldReason[] = ['required', 'too_long', 'unsupported', 'invalid', 'taken']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStatus = (value: unknown): value is SessionStatus => STATUSES.includes(value as SessionStatus)
const isServerCode = (value: string): value is SessionErrorCode => SERVER_ERROR_CODES.includes(value as SessionErrorCode)
const isReason = (value: string): value is FieldReason => REASONS.includes(value as FieldReason)

const unreadable = () => new SessionApiError('unavailable')

function parseFieldErrors(details: string | null): FieldErrors {
  if (!details) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(details)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) return {}

  const errors: FieldErrors = {}
  for (const field of FIELDS) {
    const reason = parsed[field]
    if (typeof reason === 'string') errors[field] = isReason(reason) ? fieldMessage(field, reason) : FALLBACK_FIELD_MESSAGE
  }
  return errors
}

export function toSessionError(error: unknown): SessionApiError {
  if (error instanceof SessionApiError) return error
  if (error instanceof RpcError && error.message.startsWith(APP_ERROR_PREFIX)) {
    const code = error.message.slice(APP_ERROR_PREFIX.length)
    if (isServerCode(code)) return new SessionApiError(code, code === 'invalid' ? parseFieldErrors(error.details) : {})
  }
  return new SessionApiError('unavailable')
}

function toIso(value: unknown): string {
  if (typeof value !== 'string') throw unreadable()
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw unreadable()
  return new Date(time).toISOString()
}

function parseCreated(value: unknown): CreatedSession {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.admin_token !== 'string') throw unreadable()
  return { id: value.id, adminToken: value.admin_token }
}

function parsePublicSession(value: unknown): PublicSession {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.full !== 'boolean' ||
    !isStatus(value.status)
  ) {
    throw unreadable()
  }
  return { id: value.id, title: value.title, description: value.description, status: value.status, full: value.full }
}

function parseAdminSession(value: unknown): AdminSession {
  if (!isRecord(value)) throw unreadable()
  return {
    ...parsePublicSession(value),
    createdAt: toIso(value.created_at),
    drawStartedAt: value.draw_started_at === null ? null : toIso(value.draw_started_at),
  }
}

function parseParticipant(value: unknown): Participant {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.gift !== 'string'
  ) {
    throw unreadable()
  }
  return { id: value.id, name: value.name, email: value.email, gift: value.gift }
}

function parseAdminView(value: unknown): AdminView {
  if (!isRecord(value) || !Array.isArray(value.participants)) throw unreadable()
  return { session: parseAdminSession(value.session), participants: value.participants.map(parseParticipant) }
}

export class SupabaseSessionApi implements SessionApi {
  private readonly rpc: RpcClient

  constructor(rpc: RpcClient) {
    this.rpc = rpc
  }

  async createSession(input: SessionInput): Promise<CreatedSession> {
    const { title, description } = normalizeSession(input)
    return parseCreated(await this.call('create_session', { p_title: title, p_description: description }))
  }

  async getPublicSession(id: string): Promise<PublicSession> {
    return parsePublicSession(await this.call('get_public_session', { p_session_id: id }))
  }

  async join(id: string, input: ParticipantInput): Promise<void> {
    const { name, email, gift } = normalizeInput(input)
    await this.call('join_session', { p_session_id: id, p_name: name, p_email: email, p_gift: gift })
  }

  async getAdminView(id: string, adminToken: string): Promise<AdminView> {
    return parseAdminView(await this.call('get_admin_view', { p_session_id: id, p_admin_token: adminToken }))
  }

  async addParticipant(id: string, adminToken: string, input: ParticipantInput): Promise<Participant> {
    const { name, email, gift } = normalizeInput(input)
    return parseParticipant(
      await this.call('add_participant', {
        p_session_id: id,
        p_admin_token: adminToken,
        p_name: name,
        p_email: email,
        p_gift: gift,
      }),
    )
  }

  async removeParticipant(id: string, adminToken: string, participantId: number): Promise<void> {
    await this.call('remove_participant', {
      p_session_id: id,
      p_admin_token: adminToken,
      p_participant_id: participantId,
    })
  }

  async closeSession(id: string, adminToken: string): Promise<void> {
    await this.call('close_session', { p_session_id: id, p_admin_token: adminToken })
  }

  async reopenSession(id: string, adminToken: string): Promise<void> {
    await this.call('reopen_session', { p_session_id: id, p_admin_token: adminToken })
  }

  async markDrawStarted(id: string, adminToken: string): Promise<void> {
    await this.call('mark_draw_started', { p_session_id: id, p_admin_token: adminToken })
  }

  async completeSession(id: string, adminToken: string): Promise<void> {
    await this.call('complete_session', { p_session_id: id, p_admin_token: adminToken })
  }

  async deleteSession(id: string, adminToken: string): Promise<void> {
    await this.call('delete_session', { p_session_id: id, p_admin_token: adminToken })
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.rpc(fn, args)
    } catch (error) {
      throw toSessionError(error)
    }
  }
}
