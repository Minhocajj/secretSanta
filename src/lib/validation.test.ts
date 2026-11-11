import { describe, expect, it } from 'vitest'
import type { Participant } from '../types'
import {
  LIMITS,
  SESSION_LIMITS,
  hasErrors,
  normalizeInput,
  normalizeSession,
  validateParticipant,
  validateSession,
} from './validation'

const valid = { name: 'Alice', email: 'alice@example.com', gift: '' }

const existing = (count: number): Participant[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Person ${index + 1}`,
    email: `person${index + 1}@example.com`,
    gift: '',
  }))

describe('normalizeInput', () => {
  it('trims values and collapses inner whitespace', () => {
    expect(normalizeInput({ name: '  Alice \t  Smith ', email: '  a@b.co ', gift: ' a  red\nscarf ' })).toEqual({
      name: 'Alice Smith',
      email: 'a@b.co',
      gift: 'a red scarf',
    })
  })
})

describe('validateParticipant', () => {
  it('accepts a participant without a gift idea', () => {
    expect(validateParticipant(valid, [])).toEqual({})
  })

  it('accepts a participant with a gift idea', () => {
    expect(validateParticipant({ ...valid, gift: 'A good book' }, [])).toEqual({})
  })

  it('requires a name and an email', () => {
    const errors = validateParticipant({ name: '   ', email: '', gift: '' }, [])
    expect(errors.name).toBe('Name is required')
    expect(errors.email).toBe('Email is required')
    expect(hasErrors(errors)).toBe(true)
  })

  it.each([
    'plain',
    'a@b',
    'a@b.',
    '@b.com',
    'a b@c.com',
    'a@b..com',
    'a@-b.com',
    'a@b.com,c@d.com',
    'a@b.com\nBcc: x@y.com',
    '<a@b.com>',
  ])('rejects the invalid email %j', (email) => {
    expect(validateParticipant({ ...valid, email }, []).email).toBe('Enter a valid email address')
  })

  it.each(['alice@example.com', 'first.last+tag@sub.example.co.uk', 'A@Example.COM', "o'brien@example.ie"])(
    'accepts the email %s',
    (email) => {
      expect(validateParticipant({ ...valid, email }, []).email).toBeUndefined()
    },
  )

  it('enforces length limits', () => {
    expect(validateParticipant({ ...valid, name: 'x'.repeat(LIMITS.name + 1) }, []).name).toContain('at most')
    expect(validateParticipant({ ...valid, name: 'x'.repeat(LIMITS.name) }, []).name).toBeUndefined()
    expect(validateParticipant({ ...valid, gift: 'x'.repeat(LIMITS.gift + 1) }, []).gift).toContain('at most')
    expect(validateParticipant({ ...valid, gift: 'x'.repeat(LIMITS.gift) }, []).gift).toBeUndefined()
    const longEmail = `${'x'.repeat(LIMITS.email)}@example.com`
    expect(validateParticipant({ ...valid, email: longEmail }, []).email).toBe('Enter a valid email address')
  })

  it('rejects control characters', () => {
    expect(validateParticipant({ ...valid, name: 'Bob\u0000' }, []).name).toBe('Name contains unsupported characters')
    expect(validateParticipant({ ...valid, gift: 'Socks\u0007' }, []).gift).toBe('Gift idea contains unsupported characters')
  })

  it('rejects duplicate names and emails regardless of case or surrounding spaces', () => {
    const people: Participant[] = [{ id: 1, name: 'Alice', email: 'alice@example.com', gift: '' }]
    expect(validateParticipant({ name: ' ALICE ', email: 'other@example.com', gift: '' }, people).name).toBe(
      'Someone with this name is already on the list',
    )
    expect(validateParticipant({ name: 'Bob', email: 'Alice@Example.com', gift: '' }, people).email).toBe(
      'This email is already on the list',
    )
  })

  it('stops accepting people at the participant limit', () => {
    expect(validateParticipant(valid, existing(LIMITS.participants - 1))).toEqual({})
    expect(validateParticipant(valid, existing(LIMITS.participants)).name).toContain(`${LIMITS.participants} participants`)
  })
})

describe('hasErrors', () => {
  it('is true as soon as one field has a message', () => {
    expect(hasErrors({})).toBe(false)
    expect(hasErrors({ form: 'This session is closed' })).toBe(true)
    expect(hasErrors({ title: 'Title is required' })).toBe(true)
  })
})

describe('normalizeSession', () => {
  it('trims values and collapses inner whitespace', () => {
    expect(normalizeSession({ title: '  Office \t party ', description: ' a\n note ' })).toEqual({
      title: 'Office party',
      description: 'a note',
    })
  })
})

describe('validateSession', () => {
  it('accepts a title with or without a description', () => {
    expect(validateSession({ title: 'Office party', description: '' })).toEqual({})
    expect(validateSession({ title: 'Office party', description: 'Budget: 20 euro' })).toEqual({})
  })

  it('requires a title', () => {
    expect(validateSession({ title: '   ', description: '' }).title).toBe('Title is required')
  })

  it('enforces length limits', () => {
    const ok = { title: 'x'.repeat(SESSION_LIMITS.title), description: 'y'.repeat(SESSION_LIMITS.description) }
    expect(validateSession(ok)).toEqual({})
    expect(validateSession({ ...ok, title: `${ok.title}x` }).title).toContain('at most')
    expect(validateSession({ ...ok, description: `${ok.description}y` }).description).toContain('at most')
  })

  it('rejects control characters', () => {
    expect(validateSession({ title: 'Party\u0000', description: '' }).title).toBe('Title contains unsupported characters')
    expect(validateSession({ title: 'Party', description: 'Note\u0007' }).description).toBe(
      'Description contains unsupported characters',
    )
  })
})
