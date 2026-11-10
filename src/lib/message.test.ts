import { describe, expect, it } from 'vitest'
import { buildMessage } from './message'

describe('buildMessage', () => {
  it('names the person the recipient is Santa for', () => {
    expect(buildMessage({ name: 'Alice', gift: '' })).toBe('You were chosen to be Santa for Alice.')
  })

  it('adds the wish sentence when a gift was provided', () => {
    expect(buildMessage({ name: 'Alice', gift: 'a red scarf' })).toBe(
      'You were chosen to be Santa for Alice. Alice dreams of a red scarf.',
    )
  })

  it('does not double up punctuation the user already typed', () => {
    expect(buildMessage({ name: 'Bob Jr.', gift: 'a book.' })).toBe(
      'You were chosen to be Santa for Bob Jr. Bob Jr. dreams of a book.',
    )
    expect(buildMessage({ name: 'Bob', gift: 'Lego!' })).toBe('You were chosen to be Santa for Bob. Bob dreams of Lego!')
  })
})
