import type { Participant, ParticipantInput, SessionInput } from '../types'

export const LIMITS = { name: 60, email: 254, gift: 200, participants: 100 } as const
export const SESSION_LIMITS = { title: 80, description: 500 } as const
export const MIN_PARTICIPANTS = 2
export const UNEXPECTED_FORM_ERROR = 'Something went wrong. Please try again.'

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i
const CONTROL_CHARACTERS = /\p{Cc}/u

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
    errors.name = 'Name is required'
  } else if (name.length > LIMITS.name) {
    errors.name = `Name must be at most ${LIMITS.name} characters`
  } else if (CONTROL_CHARACTERS.test(name)) {
    errors.name = 'Name contains unsupported characters'
  } else if (existing.some((participant) => sameText(participant.name, name))) {
    errors.name = 'Someone with this name is already on the list'
  }

  if (!email) {
    errors.email = 'Email is required'
  } else if (email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address'
  } else if (existing.some((participant) => sameText(participant.email, email))) {
    errors.email = 'This email is already on the list'
  }

  if (gift.length > LIMITS.gift) {
    errors.gift = `Gift idea must be at most ${LIMITS.gift} characters`
  } else if (CONTROL_CHARACTERS.test(gift)) {
    errors.gift = 'Gift idea contains unsupported characters'
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
    errors.title = 'Title is required'
  } else if (title.length > SESSION_LIMITS.title) {
    errors.title = `Title must be at most ${SESSION_LIMITS.title} characters`
  } else if (CONTROL_CHARACTERS.test(title)) {
    errors.title = 'Title contains unsupported characters'
  }

  if (description.length > SESSION_LIMITS.description) {
    errors.description = `Description must be at most ${SESSION_LIMITS.description} characters`
  } else if (CONTROL_CHARACTERS.test(description)) {
    errors.description = 'Description contains unsupported characters'
  }

  return errors
}
