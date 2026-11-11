export interface ParticipantInput {
  name: string
  email: string
  gift: string
}

export interface Participant extends ParticipantInput {
  id: number
}

export interface SessionInput {
  title: string
  description: string
}

export interface Assignment {
  santa: Participant
  giftee: Participant
}

export interface Pair {
  santa: string
  giftee: string
}

export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed'

export interface Delivery {
  participantId: number
  name: string
  email: string
  status: DeliveryStatus
  error?: string
}
