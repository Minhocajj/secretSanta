// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import type { Plugin } from 'vue'
import App from '../App.vue'
import { InMemorySessionApi } from '../lib/inMemorySessionApi'
import { loadSessions, rememberSession } from '../lib/localSessions'
import { SessionApiError, type SessionApi } from '../lib/sessionApi'
import { sessionApiKey } from '../lib/sessionApiKey'
import { createAppRouter } from '../router'
import { button, clean, mountComponent, settle, typeInto, unmountAll } from '../testing'

beforeEach(() => localStorage.clear())
afterEach(() => {
  unmountAll()
  vi.restoreAllMocks()
})

const provide = (api: SessionApi | null): Plugin => ({ install: (app) => app.provide(sessionApiKey, api) })

async function openHome(api: SessionApi | null) {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  const root = mountComponent(App, {}, [router, provide(api)])
  await settle()
  return { root, router }
}

async function createSession(root: HTMLElement, title: string, description = '') {
  await typeInto(root, '#session-title', title)
  await typeInto(root, '#session-description', description)
  button(root, 'Create session').click()
  await settle()
}

const inputValues = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLInputElement>('input[readonly]')].map((input) => input.value)

describe('HomeView', () => {
  it('creates a session and shows the participant and admin links with a warning', async () => {
    const api = new InMemorySessionApi({ randomId: () => 'sess-1', randomToken: () => 'tok-1' })
    const { root } = await openHome(api)

    await createSession(root, '  Office   party ', 'Budget 20')

    expect(clean(root.querySelector('#created-title')?.textContent)).toBe('Session created: Office party')
    expect(clean(root.textContent)).toContain("Save the admin link. Anyone with it can manage this session, and it can't be recovered.")
    expect(inputValues(root)).toEqual([`${location.origin}/join/sess-1`, `${location.origin}/admin/sess-1#tok-1`])
    expect(await api.getPublicSession('sess-1')).toMatchObject({ title: 'Office party', description: 'Budget 20' })
  })

  it('never puts the admin token in the participant link', async () => {
    const { root } = await openHome(new InMemorySessionApi({ randomId: () => 'sess-1', randomToken: () => 'tok-1' }))

    await createSession(root, 'Party')

    expect(inputValues(root)[0]).not.toContain('tok-1')
  })

  it('remembers the session on this device and lists it', async () => {
    const { root } = await openHome(new InMemorySessionApi({ randomId: () => 'sess-1', randomToken: () => 'tok-1' }))

    await createSession(root, 'Party')

    expect(loadSessions()).toEqual([expect.objectContaining({ id: 'sess-1', title: 'Party', adminToken: 'tok-1' })])
    const link = root.querySelector<HTMLAnchorElement>('#stored-title ~ ul a')
    expect(link?.textContent?.trim()).toBe('Party')
    expect(link?.getAttribute('href')).toBe('/admin/sess-1#tok-1')
  })

  it('lists sessions already stored on this device and lets you forget one', async () => {
    rememberSession({ id: 'a', title: 'Old party', adminToken: 'ta', createdAt: '2026-01-01T00:00:00.000Z' })
    const { root } = await openHome(new InMemorySessionApi())

    expect(clean(root.querySelector('#stored-title ~ ul')?.textContent)).toContain('Old party')

    button(root, 'Forget').click()
    await settle()

    expect(root.querySelector('#stored-title')).toBeNull()
    expect(loadSessions()).toEqual([])
  })

  it('does not show the stored list when nothing is stored', async () => {
    const { root } = await openHome(new InMemorySessionApi())

    expect(root.querySelector('#stored-title')).toBeNull()
  })

  it('shows validation errors without calling the API', async () => {
    const api = new InMemorySessionApi()
    const spy = vi.spyOn(api, 'createSession')
    const { root } = await openHome(api)

    await createSession(root, '   ')

    expect(root.querySelector('#session-title-error')).not.toBeNull()
    expect(spy).not.toHaveBeenCalled()
    expect(root.querySelector('#created-title')).toBeNull()
  })

  it('shows the server error and keeps what was typed', async () => {
    const api = new InMemorySessionApi()
    vi.spyOn(api, 'createSession').mockRejectedValue(new SessionApiError('rate_limited'))
    const { root } = await openHome(api)

    await createSession(root, 'Party')

    expect(clean(root.querySelector('[role="alert"]')?.textContent)).toContain('Too many requests')
    expect(root.querySelector<HTMLInputElement>('#session-title')?.value).toBe('Party')
    expect(loadSessions()).toEqual([])
  })

  it('shows field errors returned by the server', async () => {
    const api = new InMemorySessionApi()
    vi.spyOn(api, 'createSession').mockRejectedValue(new SessionApiError('invalid', { title: 'Server says no' }))
    const { root } = await openHome(api)

    await createSession(root, 'Party')

    expect(clean(root.querySelector('#session-title-error')?.textContent)).toBe('Server says no')
  })

  it('shows a generic error for unexpected failures', async () => {
    const api = new InMemorySessionApi()
    vi.spyOn(api, 'createSession').mockRejectedValue(new Error('boom'))
    const { root } = await openHome(api)

    await createSession(root, 'Party')

    expect(clean(root.querySelector('[role="alert"]')?.textContent)).toContain('Something went wrong')
  })

  it('explains that sessions are unavailable without a backend and offers the quick draw', async () => {
    const { root } = await openHome(null)

    expect(root.querySelector('#session-title')).toBeNull()
    expect(clean(root.textContent)).toContain('Sessions are not available here yet')
    expect(root.querySelector('a[href="/quick"]')).not.toBeNull()
  })

  it('copies a link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { root } = await openHome(new InMemorySessionApi({ randomId: () => 'sess-1', randomToken: () => 'tok-1' }))
    await createSession(root, 'Party')

    button(root, 'Copy').click()
    await settle()

    expect(writeText).toHaveBeenCalledWith(`${location.origin}/join/sess-1`)
    expect(clean(root.textContent)).toContain('Copied')
  })

  it('asks to copy by hand when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const { root } = await openHome(new InMemorySessionApi())
    await createSession(root, 'Party')

    button(root, 'Copy').click()
    await settle()

    expect(clean(root.textContent)).toContain('Could not copy automatically')
  })
})
