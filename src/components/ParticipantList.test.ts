// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountComponent, unmountAll } from '../testing'
import type { Participant } from '../types'
import ParticipantList from './ParticipantList.vue'

afterEach(unmountAll)

const PEOPLE: Participant[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com', gift: 'a red scarf' },
  { id: 2, name: 'Bob', email: 'bob@example.com', gift: '' },
]

describe('ParticipantList', () => {
  it('lists participants with a Remove button each and reports which one was removed', () => {
    const onRemove = vi.fn()
    const root = mountComponent(ParticipantList, { participants: PEOPLE, onRemove })

    expect(root.querySelectorAll('.participant')).toHaveLength(2)
    root.querySelector<HTMLButtonElement>('[aria-label="Remove Bob"]')!.click()

    expect(onRemove).toHaveBeenCalledWith(2)
  })

  it('is read-only when removal is switched off', () => {
    const root = mountComponent(ParticipantList, { participants: PEOPLE, removable: false })

    expect(root.querySelectorAll('.participant')).toHaveLength(2)
    expect(root.textContent).toContain('Gift idea: a red scarf')
    expect(root.querySelector('button')).toBeNull()
  })

  it('says so when nobody was added yet', () => {
    const root = mountComponent(ParticipantList, { participants: [] })

    expect(root.textContent).toContain('No participants yet.')
  })
})
