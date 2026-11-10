import { describe, expect, it } from 'vitest'
import type { Participant } from '../types'
import { drawAssignments, drawDerangement, secureRandomInt, shuffle } from './draw'

const makeParticipants = (count: number): Participant[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `P${index + 1}`,
    email: `p${index + 1}@example.com`,
    gift: '',
  }))

const ascending = (a: number, b: number) => a - b

describe('secureRandomInt', () => {
  it('stays within range and eventually yields every value', () => {
    const seen = new Set<number>()
    for (let run = 0; run < 2000; run++) {
      const value = secureRandomInt(5)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(5)
      seen.add(value)
    }
    expect(seen.size).toBe(5)
  })
})

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const result = shuffle(input)
    expect(result).not.toBe(input)
    expect([...result].sort(ascending)).toEqual([1, 2, 3, 4, 5, 6])
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('is driven entirely by the supplied random source', () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1])
  })
})

describe('drawDerangement', () => {
  it.each([2, 3, 4, 5, 8, 13, 40])('never maps anyone to themselves and uses every target once (size %i)', (size) => {
    for (let run = 0; run < 200; run++) {
      const targets = drawDerangement(size)
      expect([...targets].sort(ascending)).toEqual(Array.from({ length: size }, (_, index) => index))
      targets.forEach((target, source) => expect(target).not.toBe(source))
    }
  })

  it.each([0, 1, -2, 2.5, Number.NaN])('rejects size %s', (size) => {
    expect(() => drawDerangement(size)).toThrow(RangeError)
  })

  it('can produce every derangement of three people', () => {
    const seen = new Set<string>()
    for (let run = 0; run < 400; run++) seen.add(drawDerangement(3).join(','))
    expect([...seen].sort()).toEqual(['1,2,0', '2,0,1'])
  })

  it('avoids repeating the previous distribution when another one exists', () => {
    for (let run = 0; run < 100; run++) {
      expect(drawDerangement(3, { previous: [1, 2, 0] })).toEqual([2, 0, 1])
    }
  })

  it('still returns the only possible distribution for two people', () => {
    expect(drawDerangement(2, { previous: [1, 0] })).toEqual([1, 0])
  })

  it('gives up instead of looping forever when no acceptable distribution is found', () => {
    expect(() => drawDerangement(3, { randomInt: () => 0, previous: [1, 2, 0] })).toThrow(
      'Could not find a valid distribution',
    )
  })
})

describe('drawAssignments', () => {
  it('makes everybody Santa for exactly one other person', () => {
    const participants = makeParticipants(7)
    for (let run = 0; run < 100; run++) {
      const assignments = drawAssignments(participants)
      expect(assignments.map(({ santa }) => santa.id)).toEqual(participants.map(({ id }) => id))
      expect(new Set(assignments.map(({ giftee }) => giftee.id)).size).toBe(7)
      assignments.forEach(({ santa, giftee }) => expect(giftee.id).not.toBe(santa.id))
    }
  })

  it('differs from the previous round when asked to', () => {
    const participants = makeParticipants(3)
    let previous = drawAssignments(participants)
    for (let run = 0; run < 50; run++) {
      const next = drawAssignments(participants, { previous })
      expect(next.map(({ giftee }) => giftee.id)).not.toEqual(previous.map(({ giftee }) => giftee.id))
      previous = next
    }
  })

  it('requires at least two participants', () => {
    expect(() => drawAssignments(makeParticipants(1))).toThrow(RangeError)
  })
})
