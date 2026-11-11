// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import type { Plugin } from 'vue'
import App from '../App.vue'
import { InMemorySessionApi } from '../lib/inMemorySessionApi'
import { SessionApiError, type SessionApi } from '../lib/sessionApi'
import { sessionApiKey } from '../lib/sessionApiKey'
import { createAppRouter } from '../router'
import { button, clean, mountComponent, settle, typeInto, unmountAll } from '../testing'

afterEach(unmountAll)

const provide = (api: SessionApi | null): Plugin => ({
  install: (app) => app.provide(sessionApiKey, api),
})

async function open(path: string, api: SessionApi | null) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  const root = mountComponent(App, {}, [router, provide(api)])
  await settle()
  return { root, router }
}

async function newSession(api: InMemorySessionApi, title = 'Office party', description = 'Bring a smile') {
  const created = await api.createSession({ title, description })
  return { ...created, path: `/join/${created.id}` }
}

async function fillAndJoin(root: HTMLElement, name: string, email: string, gift = '') {
  await typeInto(root, '#participant-name', name)
  await typeInto(root, '#participant-email', email)
  await typeInto(root, '#participant-gift', gift)
  button(root, 'Join').click()
  await settle()
}

const text = (root: HTMLElement) => clean(root.textContent)
const alertText = (root: HTMLElement) => clean(root.querySelector('[role="alert"]')?.textContent ?? '')

describe('JoinView', () => {
  it('shows the title, the note, the form and a privacy notice', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api)

    const { root } = await open(path, api)

    expect(root.querySelector('#join-title')?.textContent).toBe('Office party')
    expect(text(root)).toContain('Bring a smile')
    expect(root.querySelector('#participant-name')).not.toBeNull()
    expect(text(root)).toContain('deleted automatically')
  })

  it('shows a multi-line note with its line breaks', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api, 'Office party', 'Budget 20 EUR\n\nGifts on Dec 20')

    const { root } = await open(path, api)

    const note = root.querySelector('.note')
    expect(note?.textContent).toBe('Budget 20 EUR\n\nGifts on Dec 20')
  })

  it('adds the participant and shows a confirmation', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    const { root } = await open(path, api)

    await fillAndJoin(root, 'Alice', 'alice@example.com', 'a book')

    expect(text(root)).toContain('You are on the list')
    expect(root.querySelector('form')).toBeNull()
    const { participants } = await api.getAdminView(id, adminToken)
    expect(participants).toEqual([expect.objectContaining({ name: 'Alice', email: 'alice@example.com', gift: 'a book' })])
  })

  it('never shows who else has joined', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    await api.addParticipant(id, adminToken, { name: 'Zed Zebra', email: 'zed@example.com', gift: 'secret gift' })
    const { root } = await open(path, api)

    await fillAndJoin(root, 'Alice', 'alice@example.com')

    for (const hidden of ['Zed', 'zed@example.com', 'secret gift']) expect(root.textContent).not.toContain(hidden)
    expect(root.querySelector('.participants')).toBeNull()
  })

  it('shows a field error for a taken email and keeps the form', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    await api.addParticipant(id, adminToken, { name: 'Zed', email: 'zed@example.com', gift: '' })
    const { root } = await open(path, api)

    await fillAndJoin(root, 'Alice', 'ZED@example.com')

    expect(text(root)).toContain('This email is already on the list')
    expect(root.querySelector<HTMLInputElement>('#participant-name')?.value).toBe('Alice')
    expect(text(root)).not.toContain('You are on the list')
  })

  it('says so when the session does not exist', async () => {
    const { root } = await open('/join/no-such-session', new InMemorySessionApi())

    expect(root.querySelector('#join-title')?.textContent).toBe('Session not found')
    expect(root.querySelector('form')).toBeNull()
  })

  it.each(['closed', 'completed'] as const)('shows no form when the session is %s', async (status) => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    await api.closeSession(id, adminToken)
    if (status === 'completed') {
      await api.markDrawStarted(id, adminToken)
      await api.completeSession(id, adminToken)
    }

    const { root } = await open(path, api)

    expect(text(root)).toContain('This session is closed')
    expect(root.querySelector('form')).toBeNull()
  })

  it('shows no form when the session is full', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    for (let i = 0; i < 100; i++) {
      await api.addParticipant(id, adminToken, { name: `Person ${i}`, email: `p${i}@example.com`, gift: '' })
    }

    const { root } = await open(path, api)

    expect(text(root)).toContain('This session is full')
    expect(root.querySelector('form')).toBeNull()
  })

  it('switches to the closed message when the organiser closes the session while the form is open', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    const { root } = await open(path, api)

    await api.closeSession(id, adminToken)
    await fillAndJoin(root, 'Alice', 'alice@example.com')

    expect(text(root)).toContain('This session is closed')
    expect(root.querySelector('form')).toBeNull()
  })

  it('switches to the not-found message when the session disappears while the form is open', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)
    const { root } = await open(path, api)

    await api.deleteSession(id, adminToken)
    await fillAndJoin(root, 'Alice', 'alice@example.com')

    expect(root.querySelector('#join-title')?.textContent).toBe('Session not found')
  })

  it('shows a rate-limit error inside the form', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api)
    vi.spyOn(api, 'join').mockRejectedValue(new SessionApiError('rate_limited'))
    const { root } = await open(path, api)

    await fillAndJoin(root, 'Alice', 'alice@example.com')

    expect(alertText(root)).toContain('Too many requests')
    expect(root.querySelector('form')).not.toBeNull()
  })

  it('offers a retry when the session cannot be loaded', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api)
    vi.spyOn(api, 'getPublicSession').mockRejectedValueOnce(new SessionApiError('unavailable'))
    const { root } = await open(path, api)

    expect(root.querySelector('#join-title')?.textContent).toBe('Could not load this session')

    button(root, 'Try again').click()
    await settle()

    expect(root.querySelector('#join-title')?.textContent).toBe('Office party')
    expect(root.querySelector('form')).not.toBeNull()
  })

  it('loads the other session when the link changes', async () => {
    const api = new InMemorySessionApi()
    const first = await newSession(api, 'First party', '')
    const second = await newSession(api, 'Second party', '')
    const { root, router } = await open(first.path, api)

    await router.push(second.path)
    await settle()

    expect(root.querySelector('#join-title')?.textContent).toBe('Second party')
  })

  it('explains that sessions are unavailable when no backend is configured', async () => {
    const { root } = await open('/join/some-id', null)

    expect(root.querySelector('#join-title')?.textContent).toBe('Sessions are not available')
    expect(root.querySelector('a[href="/quick"]')).not.toBeNull()
  })
})
