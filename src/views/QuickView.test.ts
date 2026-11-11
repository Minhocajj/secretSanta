// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { button, clean, mountComponent, settle, typeInto, unmountAll } from '../testing'
import QuickView from './QuickView.vue'

afterEach(unmountAll)

const mountView = () => mountComponent(QuickView)

async function addPerson(root: HTMLElement, name: string, email: string, gift = '') {
  await typeInto(root, '#participant-name', name)
  await typeInto(root, '#participant-email', email)
  await typeInto(root, '#participant-gift', gift)
  button(root, 'Add participant').click()
  await settle()
}

async function addTrio(root: HTMLElement) {
  await addPerson(root, 'Alice', 'alice@example.com', 'a red scarf')
  await addPerson(root, 'Bob', 'bob@example.com')
  await addPerson(root, 'Carol', 'carol@example.com', 'good coffee')
}

async function setShowResults(root: HTMLElement, checked: boolean) {
  const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  checkbox.checked = checked
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

const pairLines = (root: HTMLElement) =>
  [...root.querySelectorAll('.pairs li')].map((item) => clean(item.textContent))

describe('QuickView', () => {
  it('adds participants to the list and validates the form', async () => {
    const root = mountView()

    await addPerson(root, 'Alice', 'alice@example.com', 'a red scarf')
    expect(root.querySelectorAll('.participant')).toHaveLength(1)
    expect(root.textContent).toContain('Gift idea: a red scarf')
    expect(root.querySelector<HTMLInputElement>('#participant-name')!.value).toBe('')

    await addPerson(root, 'alice', 'someone@example.com')
    expect(root.textContent).toContain('Someone with this name is already on the list')

    await addPerson(root, 'Bob', 'not-an-email')
    expect(root.textContent).toContain('Enter a valid email address')
    expect(root.querySelectorAll('.participant')).toHaveLength(1)
  })

  it('removes participants', async () => {
    const root = mountView()
    await addTrio(root)

    root.querySelector<HTMLButtonElement>('[aria-label="Remove Bob"]')!.click()
    await nextTick()

    expect([...root.querySelectorAll('.participant strong')].map((item) => item.textContent)).toEqual(['Alice', 'Carol'])
  })

  it('keeps the roll button disabled until two people were added', async () => {
    const root = mountView()
    expect(button(root, 'Roll the dice').disabled).toBe(true)

    await addPerson(root, 'Alice', 'alice@example.com')
    expect(button(root, 'Roll the dice').disabled).toBe(true)

    await addPerson(root, 'Bob', 'bob@example.com')
    expect(button(root, 'Roll the dice').disabled).toBe(false)
  })

  it('shows the draw, allows re-rolling, and sends the emails only after confirmation', async () => {
    const root = mountView()
    await addTrio(root)
    await setShowResults(root, true)

    button(root, 'Roll the dice').click()
    await nextTick()

    const first = pairLines(root)
    expect(first).toHaveLength(3)
    for (const line of first) {
      const [santa, giftee] = line.split(' is Santa for ')
      expect(santa).not.toBe(giftee)
    }
    expect(root.querySelector('.badge')).toBeNull()

    button(root, 'Re-roll').click()
    await nextTick()
    expect(pairLines(root)).not.toEqual(first)

    button(root, 'Confirm and send emails').click()
    await vi.waitFor(() => expect(root.textContent).toContain('3 of 3 emails sent'))
    expect(root.querySelectorAll('.badge--sent')).toHaveLength(3)
    expect(button(root, 'Start over')).toBeDefined()
  })

  it('draws silently and never renders who got whom', async () => {
    const root = mountView()
    await addTrio(root)

    button(root, 'Roll the dice').click()
    await vi.waitFor(() => expect(root.textContent).toContain('3 of 3 emails sent'))

    expect(root.querySelector('.pairs')).toBeNull()
    expect(root.textContent).not.toContain('is Santa for')
  })

  it('lets the user go back from the draw to edit the participants', async () => {
    const root = mountView()
    await addTrio(root)
    await setShowResults(root, true)
    button(root, 'Roll the dice').click()
    await nextTick()

    button(root, 'Back to participants').click()
    await nextTick()

    expect(root.querySelectorAll('.participant')).toHaveLength(3)
    expect(root.querySelector('.pairs')).toBeNull()
  })

  it('starts over with an empty list', async () => {
    const root = mountView()
    await addTrio(root)
    button(root, 'Roll the dice').click()
    await vi.waitFor(() => expect(root.textContent).toContain('3 of 3 emails sent'))

    button(root, 'Start over').click()
    await nextTick()

    expect(root.querySelectorAll('.participant')).toHaveLength(0)
    expect(root.textContent).toContain('No participants yet.')
  })
})
