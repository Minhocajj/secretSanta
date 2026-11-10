import type { Assignment, Participant } from '../types'

export type RandomInt = (maxExclusive: number) => number

const MAX_ATTEMPTS = 1000
const UINT32_RANGE = 2 ** 32

export const secureRandomInt: RandomInt = (maxExclusive) => {
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive)
  const buffer = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % maxExclusive
}

export function shuffle<T>(items: readonly T[], randomInt: RandomInt = secureRandomInt): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const isDerangement = (targets: readonly number[]) => targets.every((target, source) => target !== source)
const isSame = (a: readonly number[], b: readonly number[]) => a.every((value, index) => value === b[index])

interface DerangementOptions {
  randomInt?: RandomInt
  previous?: readonly number[]
}

export function drawDerangement(size: number, { randomInt = secureRandomInt, previous }: DerangementOptions = {}): number[] {
  if (!Number.isInteger(size) || size < 2) throw new RangeError('At least two participants are required')
  const avoid = size > 2 && previous?.length === size ? previous : undefined
  const indices = Array.from({ length: size }, (_, index) => index)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = shuffle(indices, randomInt)
    if (isDerangement(candidate) && !(avoid && isSame(candidate, avoid))) return candidate
  }
  throw new Error('Could not find a valid distribution')
}

interface AssignmentOptions {
  randomInt?: RandomInt
  previous?: readonly Assignment[]
}

export function drawAssignments(participants: readonly Participant[], { randomInt, previous }: AssignmentOptions = {}): Assignment[] {
  const previousTargets = previous?.map(({ giftee }) => participants.findIndex(({ id }) => id === giftee.id))
  const targets = drawDerangement(participants.length, { randomInt, previous: previousTargets })
  return participants.map((santa, index) => ({ santa, giftee: participants[targets[index]] }))
}
