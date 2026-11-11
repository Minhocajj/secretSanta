// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { InMemorySessionApi } from '../lib/inMemorySessionApi'
import { toFormErrors } from '../lib/sessionApi'
import { UNEXPECTED_FORM_ERROR, type FormErrors } from '../lib/validation'
import { button, mountComponent, settle, typeInto, unmountAll } from '../testing'
import type { Participant, ParticipantInput } from '../types'
import ParticipantForm from './ParticipantForm.vue'

afterEach(unmountAll)

type Save = (input: ParticipantInput) => FormErrors | Promise<FormErrors>

const mountForm = (save: Save, props: Record<string, unknown> = {}) => mountComponent(ParticipantForm, { save, ...props })

const field = (root: HTMLElement, selector: string) => root.querySelector<HTMLInputElement>(selector)!
const alertText = (root: HTMLElement) => root.querySelector('[role="alert"]')?.textContent?.trim()

async function fill(root: HTMLElement, name: string, email: string, gift = '') {
  await typeInto(root, '#participant-name', name)
  await typeInto(root, '#participant-email', email)
  await typeInto(root, '#participant-gift', gift)
}

async function submit(root: HTMLElement, label = 'Add participant') {
  button(root, label).click()
  await settle()
}

describe('ParticipantForm', () => {
  it('passes the typed values to save, then clears the form and refocuses the name', async () => {
    const save = vi.fn<Save>(async () => ({}))
    const root = mountForm(save)
    await fill(root, 'Alice', 'alice@example.com', 'a red scarf')

    await submit(root)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ name: 'Alice', email: 'alice@example.com', gift: 'a red scarf' })
    for (const selector of ['#participant-name', '#participant-email', '#participant-gift']) {
      expect(field(root, selector).value).toBe('')
    }
    expect(document.activeElement).toBe(field(root, '#participant-name'))
  })

  it('validates locally and does not call save for invalid input', async () => {
    const save = vi.fn<Save>(async () => ({}))
    const root = mountForm(save)
    await fill(root, 'Alice', 'not-an-email')

    await submit(root)

    expect(save).not.toHaveBeenCalled()
    expect(root.textContent).toContain('Enter a valid email address')
    expect(field(root, '#participant-email').getAttribute('aria-invalid')).toBe('true')
  })

  it('checks duplicates against the participants it is given', async () => {
    const participants: Participant[] = [{ id: 1, name: 'Alice', email: 'alice@example.com', gift: '' }]
    const save = vi.fn<Save>(async () => ({}))
    const root = mountForm(save, { participants })
    await fill(root, 'alice', 'other@example.com')

    await submit(root)

    expect(save).not.toHaveBeenCalled()
    expect(root.textContent).toContain('Someone with this name is already on the list')
  })

  it('shows the field errors that save returns, keeps what was typed and clears the error on edit', async () => {
    const root = mountForm(async () => ({ email: 'This email is already on the list' }))
    await fill(root, 'Alice', 'alice@example.com')

    await submit(root)

    expect(root.textContent).toContain('This email is already on the list')
    expect(field(root, '#participant-name').value).toBe('Alice')
    expect(field(root, '#participant-email').value).toBe('alice@example.com')

    await typeInto(root, '#participant-email', 'alice@example.org')
    expect(root.textContent).not.toContain('This email is already on the list')
  })

  it('shows a form-level error that save returns', async () => {
    const root = mountForm(async () => ({ form: 'This session is closed' }))
    await fill(root, 'Alice', 'alice@example.com')

    await submit(root)

    expect(alertText(root)).toBe('This session is closed')
    expect(field(root, '#participant-name').value).toBe('Alice')
  })

  it('shows a generic error, not the details, when save throws', async () => {
    const root = mountForm(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1')
    })
    await fill(root, 'Alice', 'alice@example.com')

    await submit(root)

    expect(alertText(root)).toBe(UNEXPECTED_FORM_ERROR)
    expect(root.textContent).not.toContain('ECONNREFUSED')
    expect(field(root, '#participant-name').value).toBe('Alice')
  })

  it('disables the button and ignores a second submit while saving', async () => {
    let finish: (errors: FormErrors) => void = () => {}
    const save = vi.fn<Save>(
      () =>
        new Promise<FormErrors>((resolve) => {
          finish = resolve
        }),
    )
    const root = mountForm(save)
    await fill(root, 'Alice', 'alice@example.com')

    const add = button(root, 'Add participant')
    add.click()
    add.click()
    await nextTick()

    expect(save).toHaveBeenCalledTimes(1)
    expect(add.disabled).toBe(true)

    finish({})
    await settle()
    expect(add.disabled).toBe(false)
    expect(field(root, '#participant-name').value).toBe('')
  })

  it('uses a custom button label', () => {
    const root = mountForm(async () => ({}), { submitLabel: 'Join' })

    expect(button(root, 'Join')).toBeDefined()
    expect(root.textContent).not.toContain('Add participant')
  })

  it('shows "email taken" and "session closed" coming from a session API', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken } = await api.createSession({ title: 'Party', description: '' })
    const join: Save = async (input) => {
      try {
        await api.join(id, input)
        return {}
      } catch (error) {
        return toFormErrors(error)
      }
    }
    const root = mountForm(join, { submitLabel: 'Join' })

    await fill(root, 'Alice', 'alice@example.com')
    await submit(root, 'Join')
    expect(field(root, '#participant-name').value).toBe('')

    await fill(root, 'Alicia', 'ALICE@example.com')
    await submit(root, 'Join')
    expect(root.textContent).toContain('This email is already on the list')

    await api.closeSession(id, adminToken)
    await fill(root, 'Bob', 'bob@example.com')
    await submit(root, 'Join')
    expect(alertText(root)).toBe('This session is closed')
  })
})
