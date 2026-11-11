import { computed, ref } from 'vue'
import { deliverAll, type Job } from '../lib/delivery'
import { drawAssignments, secureRandomInt, type RandomInt } from '../lib/draw'
import { createSender, readMailConfig, sendIntervalMs, type MailConfig, type Sender } from '../lib/mailer'
import { buildMessage } from '../lib/message'
import { MIN_PARTICIPANTS, hasErrors, normalizeInput, validateParticipant, type ParticipantErrors } from '../lib/validation'
import type { Assignment, Delivery, Pair, Participant, ParticipantInput } from '../types'

export type Phase = 'edit' | 'review' | 'sending' | 'done'

export interface SecretSantaOptions {
  config?: MailConfig
  send?: Sender
  sleep?: (ms: number) => Promise<void>
  randomInt?: RandomInt
  intervalMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function useSecretSanta(options: SecretSantaOptions = {}) {
  const config = options.config ?? readMailConfig(import.meta.env)
  const send = options.send ?? createSender(config)
  const sleep = options.sleep ?? defaultSleep
  const randomInt = options.randomInt ?? secureRandomInt
  const intervalMs = options.intervalMs ?? sendIntervalMs(config)
  const canSend = config.mode !== 'unconfigured'

  const participants = ref<Participant[]>([])
  const showResults = ref(false)
  const phase = ref<Phase>('edit')
  const pairs = ref<Pair[]>([])
  const deliveries = ref<Delivery[]>([])
  let assignments: Assignment[] = []
  let nextId = 1

  const busy = computed(() => phase.value === 'sending')
  const failedCount = computed(() => deliveries.value.filter(({ status }) => status === 'failed').length)
  const canRoll = computed(
    () => !busy.value && participants.value.length >= MIN_PARTICIPANTS && (showResults.value || canSend),
  )
  const hasUndeliveredDraw = computed(
    () => phase.value === 'sending' || (phase.value === 'done' && failedCount.value > 0),
  )

  function addParticipant(input: ParticipantInput): ParticipantErrors {
    if (phase.value !== 'edit') return { name: 'Participants can only be changed before rolling' }
    const errors = validateParticipant(input, participants.value)
    if (!hasErrors(errors)) participants.value.push({ id: nextId++, ...normalizeInput(input) })
    return errors
  }

  function removeParticipant(id: number) {
    if (phase.value === 'edit') participants.value = participants.value.filter((participant) => participant.id !== id)
  }

  function setParticipants(list: readonly Participant[]) {
    if (phase.value !== 'edit') return
    participants.value = list.map((participant) => ({ ...participant }))
    nextId = Math.max(nextId, ...list.map(({ id }) => id + 1))
  }

  function queueJobs(retryOnly: boolean): Job[] {
    if (retryOnly) {
      for (const delivery of deliveries.value) {
        if (delivery.status === 'failed') {
          delivery.status = 'queued'
          delete delivery.error
        }
      }
    } else {
      deliveries.value = assignments.map(
        ({ santa }): Delivery => ({ participantId: santa.id, name: santa.name, email: santa.email, status: 'queued' }),
      )
    }
    const queued = new Set(
      deliveries.value.filter(({ status }) => status === 'queued').map(({ participantId }) => participantId),
    )
    return assignments
      .filter(({ santa }) => queued.has(santa.id))
      .map(({ santa, giftee }) => ({
        participantId: santa.id,
        params: { to_name: santa.name, to_email: santa.email, message: buildMessage(giftee) },
      }))
  }

  async function deliver(retryOnly: boolean) {
    const jobs = queueJobs(retryOnly)
    phase.value = 'sending'
    try {
      await deliverAll(jobs, { send, sleep, intervalMs }, (participantId, update) => {
        const delivery = deliveries.value.find((item) => item.participantId === participantId)
        if (delivery) Object.assign(delivery, update)
      })
    } finally {
      phase.value = 'done'
    }
    if (failedCount.value === 0) assignments = []
  }

  async function roll() {
    if (!canRoll.value || (phase.value !== 'edit' && phase.value !== 'review')) return
    assignments = drawAssignments(participants.value, {
      randomInt,
      previous: phase.value === 'review' ? assignments : undefined,
    })
    if (!showResults.value) return deliver(false)
    pairs.value = assignments.map(({ santa, giftee }) => ({ santa: santa.name, giftee: giftee.name }))
    phase.value = 'review'
  }

  async function reroll() {
    if (phase.value === 'review') await roll()
  }

  async function confirm() {
    if (phase.value === 'review' && canSend) await deliver(false)
  }

  async function retryFailed() {
    if (phase.value === 'done' && failedCount.value > 0) await deliver(true)
  }

  function backToEdit() {
    if (phase.value !== 'review') return
    assignments = []
    pairs.value = []
    phase.value = 'edit'
  }

  function startOver() {
    if (busy.value) return
    assignments = []
    pairs.value = []
    deliveries.value = []
    participants.value = []
    phase.value = 'edit'
  }

  return {
    config,
    canSend,
    participants,
    showResults,
    phase,
    pairs,
    deliveries,
    busy,
    failedCount,
    canRoll,
    hasUndeliveredDraw,
    addParticipant,
    removeParticipant,
    setParticipants,
    roll,
    reroll,
    confirm,
    retryFailed,
    backToEdit,
    startOver,
  }
}

export type SecretSanta = ReturnType<typeof useSecretSanta>
