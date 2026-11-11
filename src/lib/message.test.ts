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

  it('removes formatting marks from a one-line gift idea', () => {
    expect(buildMessage({ name: 'Alice', gift: 'a **red** *wool* scarf' })).toBe(
      'You were chosen to be Santa for Alice. Alice dreams of a red wool scarf.',
    )
  })

  it('writes links with their address', () => {
    expect(buildMessage({ name: 'Alice', gift: 'this [book](https://example.com/b)' })).toBe(
      'You were chosen to be Santa for Alice. Alice dreams of this book (https://example.com/b).',
    )
  })

  it('writes a list as lines under the sentence', () => {
    expect(buildMessage({ name: 'Alice', gift: '- a scarf\n- **a book** (https://example.com/b)\n- socks' })).toBe(
      'You were chosen to be Santa for Alice.\n\nAlice dreams of:\n• a scarf\n• a book (https://example.com/b)\n• socks',
    )
  })

  it('also treats a single list item as a list', () => {
    expect(buildMessage({ name: 'Alice', gift: '- a scarf' })).toBe(
      'You were chosen to be Santa for Alice.\n\nAlice dreams of:\n• a scarf',
    )
  })

  it('keeps the lines of a multi-line gift idea', () => {
    expect(buildMessage({ name: 'Alice', gift: 'something warm\nsize M' })).toBe(
      'You were chosen to be Santa for Alice.\n\nAlice dreams of:\nsomething warm\nsize M',
    )
  })

  it('never puts markup or HTML characters of its own into the message', () => {
    const message = buildMessage({ name: 'Alice', gift: '- *a* **b** [c](https://example.com)' })

    expect(message).not.toMatch(/[*]|\]\(/)
  })

  it('does not double up punctuation the user already typed', () => {
    expect(buildMessage({ name: 'Bob Jr.', gift: 'a book.' })).toBe(
      'You were chosen to be Santa for Bob Jr. Bob Jr. dreams of a book.',
    )
    expect(buildMessage({ name: 'Bob', gift: 'Lego!' })).toBe('You were chosen to be Santa for Bob. Bob dreams of Lego!')
  })
})
