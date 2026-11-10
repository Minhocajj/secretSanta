import { describe, expect, it } from 'vitest'
import { MailError, type EmailParams } from '../lib/mailer'
import { buildMessage } from '../lib/message'
import { useSecretSanta, type SecretSantaOptions } from './useSecretSanta'

const PEOPLE = [
  { name: 'Alice', email: 'alice@example.com', gift: 'a red scarf' },
  { name: 'Bob', email: 'bob@example.com', gift: '' },
  { name: 'Carol', email: 'carol@example.com', gift: 'good coffee' },
  { name: 'Dave', email: 'dave@example.com', gift: '' },
]
const NAMES = PEOPLE.map(({ name }) => name)

function setup(options: SecretSantaOptions = {}, people = PEOPLE) {
  const sent: EmailParams[] = []
  const santa = useSecretSanta({
    config: { mode: 'dry-run' },
    send: async (params) => {
      sent.push(params)
    },
    sleep: async () => {},
    intervalMs: 0,
    ...options,
  })
  for (const person of people) expect(santa.addParticipant(person)).toEqual({})
  return { santa, sent }
}

function deferred() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const gifteeNameIn = (message: string) => /Santa for ([^.]+?)\./.exec(message)?.[1]

const pairsFromEmails = (sent: EmailParams[]) => new Map(sent.map((email) => [email.to_name, gifteeNameIn(email.message)]))

function expectValidDistribution(distribution: Map<string, string | undefined>) {
  expect([...distribution.keys()].sort()).toEqual([...NAMES].sort())
  expect([...distribution.values()].sort()).toEqual([...NAMES].sort())
  for (const [santa, giftee] of distribution) expect(giftee).not.toBe(santa)
}

describe('managing participants', () => {
  it('normalizes and stores valid participants, rejecting duplicates and invalid input', () => {
    const { santa } = setup({}, [])

    expect(santa.addParticipant({ name: '  Alice  ', email: ' alice@example.com ', gift: '' })).toEqual({})
    expect(santa.participants.value).toEqual([{ id: 1, name: 'Alice', email: 'alice@example.com', gift: '' }])
    expect(santa.addParticipant({ name: 'alice', email: 'other@example.com', gift: '' }).name).toBeDefined()
    expect(santa.addParticipant({ name: 'Zed', email: 'not-an-email', gift: '' }).email).toBeDefined()
    expect(santa.participants.value).toHaveLength(1)
  })

  it('removes participants by id', () => {
    const { santa } = setup()
    santa.removeParticipant(2)
    expect(santa.participants.value.map(({ name }) => name)).toEqual(['Alice', 'Carol', 'Dave'])
  })

  it('needs at least two participants before rolling', () => {
    const { santa } = setup({}, PEOPLE.slice(0, 1))
    expect(santa.canRoll.value).toBe(false)
    santa.addParticipant(PEOPLE[1])
    expect(santa.canRoll.value).toBe(true)
  })

  it('locks the list once a draw exists', async () => {
    const { santa } = setup()
    santa.showResults.value = true
    await santa.roll()

    expect(santa.addParticipant({ name: 'Eve', email: 'eve@example.com', gift: '' }).name).toBeDefined()
    santa.removeParticipant(1)
    expect(santa.participants.value).toHaveLength(4)
  })
})

describe('silent mode (results hidden)', () => {
  it('emails everybody immediately and never exposes who got whom', async () => {
    const { santa, sent } = setup()

    await santa.roll()

    expect(santa.phase.value).toBe('done')
    expect(santa.pairs.value).toEqual([])
    expect(santa.deliveries.value.map(({ status }) => status)).toEqual(['sent', 'sent', 'sent', 'sent'])
    for (const delivery of santa.deliveries.value) {
      expect(Object.keys(delivery).sort()).toEqual(['email', 'name', 'participantId', 'status'])
    }
    expect(sent.map(({ to_email }) => to_email)).toEqual(PEOPLE.map(({ email }) => email))
    expectValidDistribution(pairsFromEmails(sent))
  })

  it('mentions the gift only for people who listed one', async () => {
    const { santa, sent } = setup()

    await santa.roll()

    for (const email of sent) {
      const giftee = PEOPLE.find(({ name }) => name === gifteeNameIn(email.message))!
      expect(email.message).toBe(buildMessage(giftee))
      expect(email.message.includes('dreams of')).toBe(Boolean(giftee.gift))
    }
  })

  it('ignores a second roll while emails are going out', async () => {
    const gate = deferred()
    const delivered: EmailParams[] = []
    const { santa } = setup({
      send: async (params) => {
        await gate.promise
        delivered.push(params)
      },
    })

    const first = santa.roll()
    expect(santa.busy.value).toBe(true)
    expect(santa.hasUndeliveredDraw.value).toBe(true)
    await santa.roll()
    gate.release()
    await first

    expect(delivered).toHaveLength(4)
    expect(santa.hasUndeliveredDraw.value).toBe(false)
  })
})

describe('review mode (results shown)', () => {
  async function review(options: SecretSantaOptions = {}, people = PEOPLE) {
    const context = setup(options, people)
    context.santa.showResults.value = true
    await context.santa.roll()
    return context
  }

  it('shows the pairing and sends nothing until confirmed', async () => {
    const { santa, sent } = await review()

    expect(santa.phase.value).toBe('review')
    expect(sent).toHaveLength(0)
    expectValidDistribution(new Map(santa.pairs.value.map(({ santa: from, giftee }) => [from, giftee])))
  })

  it('re-rolls as often as wanted and always changes the result for three people', async () => {
    const { santa } = await review({}, PEOPLE.slice(0, 3))
    let previous = JSON.stringify(santa.pairs.value)

    for (let run = 0; run < 25; run++) {
      await santa.reroll()
      const current = JSON.stringify(santa.pairs.value)
      expect(santa.phase.value).toBe('review')
      expect(current).not.toBe(previous)
      previous = current
    }
  })

  it('emails exactly the pairing that was on screen when confirmed', async () => {
    const { santa, sent } = await review()
    await santa.reroll()
    await santa.reroll()
    const shown = new Map(santa.pairs.value.map(({ santa: from, giftee }) => [from, giftee]))

    await santa.confirm()

    expect(santa.phase.value).toBe('done')
    expect(sent).toHaveLength(4)
    expect(pairsFromEmails(sent)).toEqual(shown)
    expect(santa.pairs.value).toHaveLength(4)
  })

  it('cannot be confirmed or re-rolled outside the review step', async () => {
    const { santa, sent } = setup()

    await santa.confirm()
    await santa.reroll()

    expect(santa.phase.value).toBe('edit')
    expect(sent).toHaveLength(0)
  })

  it('can go back to editing, which discards the draw', async () => {
    const { santa, sent } = await review()

    santa.backToEdit()

    expect(santa.phase.value).toBe('edit')
    expect(santa.pairs.value).toEqual([])
    await santa.confirm()
    expect(sent).toHaveLength(0)
  })
})

describe('delivery problems', () => {
  it('keeps the draw after a failure and retries only the failed recipient with the same message', async () => {
    let failBob = true
    const attempts: EmailParams[] = []
    const { santa } = setup({
      send: async (params) => {
        attempts.push(params)
        if (params.to_name === 'Bob' && failBob) throw new MailError('EmailJS rejected the request (422): bad address')
      },
    })

    await santa.roll()

    expect(santa.phase.value).toBe('done')
    expect(santa.failedCount.value).toBe(1)
    expect(santa.hasUndeliveredDraw.value).toBe(true)
    expect(santa.deliveries.value.find(({ name }) => name === 'Bob')).toMatchObject({
      status: 'failed',
      error: 'EmailJS rejected the request (422): bad address',
    })
    const firstBobAttempt = attempts.find(({ to_name }) => to_name === 'Bob')

    failBob = false
    attempts.length = 0
    await santa.retryFailed()

    expect(attempts).toEqual([firstBobAttempt])
    expect(santa.failedCount.value).toBe(0)
    expect(santa.deliveries.value.every(({ status }) => status === 'sent')).toBe(true)
    expect(santa.deliveries.value.find(({ name }) => name === 'Bob')).not.toHaveProperty('error')
    expect(santa.hasUndeliveredDraw.value).toBe(false)
  })

  it('has nothing to retry once everything was delivered', async () => {
    const { santa, sent } = setup()
    await santa.roll()
    sent.length = 0

    await santa.retryFailed()

    expect(sent).toHaveLength(0)
  })

  it('sends nothing when email is not configured, but still allows previewing the draw', async () => {
    const { santa, sent } = setup({ config: { mode: 'unconfigured', missing: ['VITE_EMAILJS_PUBLIC_KEY'] } })

    expect(santa.canRoll.value).toBe(false)
    await santa.roll()
    expect(santa.phase.value).toBe('edit')

    santa.showResults.value = true
    expect(santa.canRoll.value).toBe(true)
    await santa.roll()
    expect(santa.phase.value).toBe('review')
    await santa.confirm()
    expect(santa.phase.value).toBe('review')
    expect(sent).toHaveLength(0)
  })
})

describe('starting over', () => {
  it('clears participants and results', async () => {
    const { santa } = setup()
    santa.showResults.value = true
    await santa.roll()
    await santa.confirm()

    santa.startOver()

    expect(santa.phase.value).toBe('edit')
    expect(santa.participants.value).toEqual([])
    expect(santa.pairs.value).toEqual([])
    expect(santa.deliveries.value).toEqual([])
  })

  it('is ignored while emails are being sent', async () => {
    const gate = deferred()
    const { santa } = setup({ send: () => gate.promise })
    const rolling = santa.roll()

    santa.startOver()
    expect(santa.participants.value).toHaveLength(4)
    gate.release()
    await rolling
  })
})
