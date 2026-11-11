// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY, findAdminToken, forgetSession, loadSessions, rememberSession } from './localSessions'

const entry = (id: string, title = `Session ${id}`) => ({
  id,
  title,
  adminToken: `token-${id}`,
  createdAt: '2026-11-11T10:00:00.000Z',
})

beforeEach(() => localStorage.clear())

describe('localSessions', () => {
  it('starts empty', () => {
    expect(loadSessions()).toEqual([])
    expect(findAdminToken('a')).toBeNull()
  })

  it('remembers sessions newest first and finds their token', () => {
    rememberSession(entry('a'))
    rememberSession(entry('b'))

    expect(loadSessions().map(({ id }) => id)).toEqual(['b', 'a'])
    expect(findAdminToken('a')).toBe('token-a')
  })

  it('updates an existing session instead of duplicating it, keeping its first creation date', () => {
    rememberSession(entry('a', 'Old'))
    rememberSession({ ...entry('a', 'New'), createdAt: '2027-01-01T00:00:00.000Z' })

    expect(loadSessions()).toEqual([entry('a', 'New')])
  })

  it('forgets a session', () => {
    rememberSession(entry('a'))
    rememberSession(entry('b'))
    forgetSession('a')

    expect(loadSessions().map(({ id }) => id)).toEqual(['b'])
  })

  it('keeps at most 50 sessions', () => {
    for (let i = 0; i < 60; i++) rememberSession(entry(String(i)))

    expect(loadSessions()).toHaveLength(50)
    expect(loadSessions()[0]?.id).toBe('59')
  })

  it.each(['not json', '{"a":1}', 'null', '[1, "x", {"id":"a"}]'])('ignores damaged storage %j', (raw) => {
    localStorage.setItem(STORAGE_KEY, raw)

    expect(loadSessions()).toEqual([])
  })

  it('drops damaged entries but keeps valid ones', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'x' }, entry('a')]))

    expect(loadSessions()).toEqual([entry('a')])
  })

  it('reports failure instead of throwing when storage rejects writes', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    try {
      expect(rememberSession(entry('a'))).toBe(false)
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
