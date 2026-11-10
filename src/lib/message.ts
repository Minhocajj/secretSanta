import type { Participant } from '../types'

const endSentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

export function buildMessage(giftee: Pick<Participant, 'name' | 'gift'>): string {
  const sentences = [endSentence(`You were chosen to be Santa for ${giftee.name}`)]
  if (giftee.gift) sentences.push(endSentence(`${giftee.name} dreams of ${giftee.gift}`))
  return sentences.join(' ')
}
