import type { Participant, ParticipantInput, SessionInput } from '../types'

export const LIMITS = { name: 60, email: 254, gift: 200, participants: 100 } as const
export const SESSION_LIMITS = { title: 80, description: 500 } as const
export const MIN_PARTICIPANTS = 2
export const UNEXPECTED_FORM_ERROR = 'Something went wrong. Please try again.'

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
const CONTROL_CHARACTERS = /\p{Cc}/u

export type FieldReason = 'required' | 'too_long' | 'unsupported' | 'invalid' | 'taken'
export type MessageField = keyof ParticipantInput | keyof SessionInput

const FIELD_MESSAGES: Record<MessageField, Partial<Record<FieldReason, string>>> = {
  name: {
    required: 'Name is required',
    too_long: `Name must be at most ${LIMITS.name} characters`,
    unsupported: 'Name contains unsupported characters',
    taken: 'Someone with this name is already on the list',
  },
  email: {
    required: 'Email is required',
    invalid: 'Enter a valid email address',
    taken: 'This email is already on the list',
  },
  gift: {
    too_long: `Gift idea must be at most ${LIMITS.gift} characters`,
    unsupported: 'Gift idea contains unsupported characters',
  },
  title: {
    required: 'Title is required',
    too_long: `Title must be at most ${SESSION_LIMITS.title} characters`,
    unsupported: 'Title contains unsupported characters',
  },
  description: {
    too_long: `Description must be at most ${SESSION_LIMITS.description} characters`,
    unsupported: 'Description contains unsupported characters',
  },
}

export const FALLBACK_FIELD_MESSAGE = 'Please check this field'

export const fieldMessage = (field: MessageField, reason: FieldReason): string =>
  FIELD_MESSAGES[field][reason] ?? FALLBACK_FIELD_MESSAGE

export type ParticipantErrors = Partial<Record<keyof ParticipantInput, string>>
export type FormErrors = ParticipantErrors & { form?: string }
export type SessionErrors = Partial<Record<keyof SessionInput, string>>

const collapseSpaces = (value: string) => value.replace(/\s+/gu, ' ').trim()
const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export const hasErrors = (errors: object) => Object.keys(errors).length > 0

export function normalizeInput({ name, email, gift }: ParticipantInput): ParticipantInput {
  return { name: collapseSpaces(name), email: email.trim(), gift: collapseSpaces(gift) }
}

export function validateParticipant(input: ParticipantInput, existing: readonly Participant[]): ParticipantErrors {
  const { name, email, gift } = normalizeInput(input)
  const errors: ParticipantErrors = {}

  if (existing.length >= LIMITS.participants) {
    errors.name = `At most ${LIMITS.participants} participants are supported`
  } else if (!name) {
    errors.name = fieldMessage('name', 'required')
  } else if (name.length > LIMITS.name) {
    errors.name = fieldMessage('name', 'too_long')
  } else if (CONTROL_CHARACTERS.test(name)) {
    errors.name = fieldMessage('name', 'unsupported')
  } else if (existing.some((participant) => sameText(participant.name, name))) {
    errors.name = fieldMessage('name', 'taken')
  }

  if (!email) {
    errors.email = fieldMessage('email', 'required')
  } else if (email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) {
    errors.email = fieldMessage('email', 'invalid')
  } else if (existing.some((participant) => sameText(participant.email, email))) {
    errors.email = fieldMessage('email', 'taken')
  }

  if (gift.length > LIMITS.gift) {
    errors.gift = fieldMessage('gift', 'too_long')
  } else if (CONTROL_CHARACTERS.test(gift)) {
    errors.gift = fieldMessage('gift', 'unsupported')
  }

  return errors
}

export function normalizeSession({ title, description }: SessionInput): SessionInput {
  return { title: collapseSpaces(title), description: collapseSpaces(description) }
}

export function validateSession(input: SessionInput): SessionErrors {
  const { title, description } = normalizeSession(input)
  const errors: SessionErrors = {}

  if (!title) {
    errors.title = fieldMessage('title', 'required')
  } else if (title.length > SESSION_LIMITS.title) {
    errors.title = fieldMessage('title', 'too_long')
  } else if (CONTROL_CHARACTERS.test(title)) {
    errors.title = fieldMessage('title', 'unsupported')
  }

  if (description.length > SESSION_LIMITS.description) {
    errors.description = fieldMessage('description', 'too_long')
  } else if (CONTROL_CHARACTERS.test(description)) {
    errors.description = fieldMessage('description', 'unsupported')
  }

  return errors
}
