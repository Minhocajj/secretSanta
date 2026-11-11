export interface StoredSession {
  id: string
  title: string
  adminToken: string
  createdAt: string
}

export const STORAGE_KEY = 'secret-santa:sessions'
const MAX_STORED = 50

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false
  const { id, title, adminToken, createdAt } = value as Record<string, unknown>
  return isText(id) && typeof title === 'string' && isText(adminToken) && typeof createdAt === 'string'
}

export function loadSessions(): StoredSession[] {
  try {
    const parsed: unknown = JSON.parse(getStorage()?.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isStoredSession).slice(0, MAX_STORED) : []
  } catch {
    return []
  }
}

function save(sessions: StoredSession[]): boolean {
  try {
    const storage = getStorage()
    if (!storage) return false
    storage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    return true
  } catch {
    return false
  }
}

export function rememberSession(session: StoredSession): boolean {
  const others = loadSessions().filter(({ id }) => id !== session.id)
  const previous = loadSessions().find(({ id }) => id === session.id)
  return save([{ ...session, createdAt: previous?.createdAt || session.createdAt }, ...others].slice(0, MAX_STORED))
}

export function forgetSession(id: string): boolean {
  return save(loadSessions().filter((session) => session.id !== id))
}

export function findAdminToken(id: string): string | null {
  return loadSessions().find((session) => session.id === id)?.adminToken ?? null
}
