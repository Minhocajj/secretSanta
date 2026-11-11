import type { Participant } from '../types'
import { hasList, toPlainText } from './richText'

const endSentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

export function buildMessage(giftee: Pick<Participant, 'name' | 'gift'>): string {
  const intro = endSentence(`You were chosen to be Santa for ${giftee.name}`)
  const wish = toPlainText(giftee.gift)
  if (!wish) return intro
  if (wish.includes('\n') || hasList(giftee.gift)) return `${intro}\n\n${giftee.name} dreams of:\n${wish}`
  return `${intro} ${endSentence(`${giftee.name} dreams of ${wish}`)}`
}
