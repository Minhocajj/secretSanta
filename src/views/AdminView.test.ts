// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import type { Plugin } from 'vue'
import App from '../App.vue'
import { InMemorySessionApi } from '../lib/inMemorySessionApi'
import { findAdminToken, loadSessions, rememberSession } from '../lib/localSessions'
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

async function openAdmin(path: string, api: SessionApi | null) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  const root = mountComponent(App, {}, [router, provide(api)])
  await settle()
  await settle()
  return { root, router }
}

async function newSession(api: InMemorySessionApi, people = 0) {
  const { id, adminToken } = await api.createSession({ title: 'Office party', description: 'Bring a smile' })
  for (let i = 0; i < people; i++) {
    await api.addParticipant(id, adminToken, { name: `Person ${i}`, email: `p${i}@example.com`, gift: '' })
  }
  return { id, adminToken, path: `/admin/${id}#${adminToken}` }
}

const text = (root: HTMLElement) => clean(root.textContent)
const title = (root: HTMLElement) => root.querySelector('#admin-title')?.textContent

describe('AdminView', () => {
  it('shows the session, the participant link and the participants', async () => {
    const api = new InMemorySessionApi()
    const { id, path } = await newSession(api, 2)

    const { root } = await openAdmin(path, api)

    expect(title(root)).toBe('Office party')
    expect(text(root)).toContain('Bring a smile')
    expect(root.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(`${location.origin}/join/${id}`)
    expect(text(root)).toContain('Person 0')
    expect(text(root)).toContain('p1@example.com')
    expect(root.querySelector('#admin-participants-title .count')?.textContent).toBe('2')
  })

  it('remembers the session on this device', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api)

    await openAdmin(path, api)

    expect(loadSessions()).toEqual([expect.objectContaining({ id, title: 'Office party', adminToken })])
  })

  it('falls back to the token stored on this device when the link has no fragment', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken } = await newSession(api)
    rememberSession({ id, title: 'Office party', adminToken, createdAt: '2026-01-01T00:00:00.000Z' })

    const { root } = await openAdmin(`/admin/${id}`, api)

    expect(title(root)).toBe('Office party')
  })

  it('asks for the complete link when there is no token anywhere', async () => {
    const api = new InMemorySessionApi()
    const { id } = await newSession(api)

    const { root } = await openAdmin(`/admin/${id}`, api)

    expect(title(root)).toBe('Admin link incomplete')
  })

  it('treats a wrong token like an unknown session', async () => {
    const api = new InMemorySessionApi()
    const { id } = await newSession(api)

    const { root } = await openAdmin(`/admin/${id}#wrong`, api)

    expect(title(root)).toBe('Session not found')
    expect(root.querySelector('form')).toBeNull()
    expect(text(root)).not.toContain('Office party')
  })

  it('offers a retry when the session cannot be loaded', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api)
    vi.spyOn(api, 'getAdminView').mockRejectedValueOnce(new SessionApiError('unavailable'))
    const { root } = await openAdmin(path, api)

    expect(title(root)).toBe('Could not load this session')

    button(root, 'Try again').click()
    await settle()

    expect(title(root)).toBe('Office party')
  })

  it('explains that sessions are unavailable without a backend', async () => {
    const { root } = await openAdmin('/admin/x#y', null)

    expect(title(root)).toBe('Sessions are not available')
  })

  it('adds a participant and lists them', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api, 1)
    const { root } = await openAdmin(path, api)

    await typeInto(root, '#participant-name', 'Alice')
    await typeInto(root, '#participant-email', 'alice@example.com')
    button(root, 'Add participant').click()
    await settle()

    expect(text(root)).toContain('Alice')
    expect(root.querySelector('#admin-participants-title .count')?.textContent).toBe('2')
  })

  it('shows the error when a participant cannot be added', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api, 1)
    const { root } = await openAdmin(path, api)
    await api.closeSession(id, adminToken)

    await typeInto(root, '#participant-name', 'Alice')
    await typeInto(root, '#participant-email', 'alice@example.com')
    button(root, 'Add participant').click()
    await settle()

    expect(root.querySelector('form')).toBeNull()
    expect(text(root)).toContain('Closed: nobody can join anymore')
  })

  it('removes a participant', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api, 3)
    const { root } = await openAdmin(path, api)

    button(root, 'Remove').click()
    await settle()

    expect(root.querySelector('#admin-participants-title .count')?.textContent).toBe('2')
    expect(text(root)).not.toContain('Person 0')
  })

  it('cannot close the session until there are enough participants', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api, 1)
    const { root } = await openAdmin(path, api)

    expect(button(root, 'Close session').disabled).toBe(true)
    expect(text(root)).toContain('Add at least 2 participants to close the session')
  })

  it('closes the session, which stops new joins, and reopens it', async () => {
    const api = new InMemorySessionApi()
    const { id, path } = await newSession(api, 2)
    const { root } = await openAdmin(path, api)

    button(root, 'Close session').click()
    await settle()

    expect(text(root)).toContain('Closed: nobody can join anymore')
    expect((await api.getPublicSession(id)).status).toBe('closed')
    expect(root.querySelector('form')).toBeNull()
    expect(root.querySelector('input[readonly]')).toBeNull()
    expect([...root.querySelectorAll('button')].some((b) => b.textContent?.includes('Remove'))).toBe(false)

    button(root, 'Reopen session').click()
    await settle()

    expect((await api.getPublicSession(id)).status).toBe('open')
    expect(root.querySelector('form')).not.toBeNull()
  })

  it('does not offer to reopen once the draw has started', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api, 2)
    await api.closeSession(id, adminToken)
    await api.markDrawStarted(id, adminToken)

    const { root } = await openAdmin(path, api)

    expect(() => button(root, 'Reopen session')).toThrow()
    expect(text(root)).toContain("The draw has started, so this session can't be reopened")
  })

  it('shows the server message when an action is refused', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api, 2)
    vi.spyOn(api, 'closeSession').mockRejectedValue(new SessionApiError('conflict'))
    const { root } = await openAdmin(path, api)

    button(root, 'Close session').click()
    await settle()

    expect(clean(root.querySelector('[role="alert"]')?.textContent)).toContain('not possible in the current state')
    expect(button(root, 'Close session').disabled).toBe(false)
  })

  it('asks before deleting, then deletes, forgets the session and goes home', async () => {
    const api = new InMemorySessionApi()
    const { id, path } = await newSession(api, 2)
    const { root, router } = await openAdmin(path, api)

    button(root, 'Delete session').click()
    await settle()
    expect(text(root)).toContain('permanently deletes the session')
    button(root, 'Cancel').click()
    await settle()
    expect(text(root)).not.toContain('permanently deletes the session')

    button(root, 'Delete session').click()
    await settle()
    button(root, 'Yes, delete').click()
    await settle()
    await settle()

    await expect(api.getPublicSession(id)).rejects.toMatchObject({ code: 'not_found' })
    expect(findAdminToken(id)).toBeNull()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('refreshes when the window regains focus', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api, 1)
    const { root } = await openAdmin(path, api)

    await api.addParticipant(id, adminToken, { name: 'Late Joiner', email: 'late@example.com', gift: '' })
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(text(root)).toContain('Late Joiner')
  })

  it('refreshes on a timer and stops after leaving the page', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const api = new InMemorySessionApi()
      const { id, adminToken, path } = await newSession(api, 1)
      const { root, router } = await openAdmin(path, api)
      const spy = vi.spyOn(api, 'getAdminView')
      await api.addParticipant(id, adminToken, { name: 'Late Joiner', email: 'late@example.com', gift: '' })

      vi.advanceTimersByTime(10_000)
      await settle()
      expect(text(root)).toContain('Late Joiner')

      await router.push('/quick')
      await settle()
      spy.mockClear()
      vi.advanceTimersByTime(60_000)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows not found when the session disappears during a refresh', async () => {
    const api = new InMemorySessionApi()
    const { id, adminToken, path } = await newSession(api, 1)
    const { root } = await openAdmin(path, api)

    await api.deleteSession(id, adminToken)
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(title(root)).toBe('Session not found')
  })

  it('keeps showing the session when a refresh fails temporarily', async () => {
    const api = new InMemorySessionApi()
    const { path } = await newSession(api, 1)
    const { root } = await openAdmin(path, api)
    vi.spyOn(api, 'getAdminView').mockRejectedValue(new SessionApiError('unavailable'))

    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(title(root)).toBe('Office party')
  })
})
