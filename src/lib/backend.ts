import { createRpcClient } from './rpcClient'
import type { SessionApi } from './sessionApi'
import { SupabaseSessionApi } from './supabaseSessionApi'

const ENV_NAMES = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface SupabaseBackendConfig {
  mode: 'supabase'
  url: string
  publishableKey: string
}

export type BackendConfig = SupabaseBackendConfig | { mode: 'unconfigured'; problems: string[] }

function normalizeUrl(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  const secure = parsed.protocol === 'https:'
  const local = parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname)
  return secure || local ? parsed.origin : null
}

function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/')
    const payload: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    const role = typeof payload === 'object' && payload !== null ? (payload as { role?: unknown }).role : null
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

function keyProblem(key: string): string | null {
  const name = ENV_NAMES.publishableKey
  const secret = `${name} holds a secret key. Use the publishable key (sb_publishable_...): every VITE_ value is public`
  if (key.startsWith('sb_secret_')) return secret
  if (key.startsWith('sb_publishable_')) return null

  const role = jwtRole(key)
  if (role === 'service_role') return secret
  if (role === 'anon') return null
  return `${name} must be a publishable key (sb_publishable_...)`
}

export function readBackendConfig(env: Record<string, unknown>): BackendConfig {
  const read = (name: string) => {
    const value = env[name]
    return typeof value === 'string' ? value.trim() : ''
  }
  const rawUrl = read(ENV_NAMES.url)
  const rawKey = read(ENV_NAMES.publishableKey)
  const problems: string[] = []

  const url = rawUrl ? normalizeUrl(rawUrl) : null
  if (!rawUrl) problems.push(`${ENV_NAMES.url} is missing`)
  else if (!url) problems.push(`${ENV_NAMES.url} must be an https URL such as https://your-project.supabase.co`)

  if (!rawKey) problems.push(`${ENV_NAMES.publishableKey} is missing`)
  else {
    const problem = keyProblem(rawKey)
    if (problem) problems.push(problem)
  }

  return problems.length || !url ? { mode: 'unconfigured', problems } : { mode: 'supabase', url, publishableKey: rawKey }
}

export function createSessionApi(config: BackendConfig, fetchImpl: typeof fetch = fetch): SessionApi | null {
  if (config.mode !== 'supabase') return null
  return new SupabaseSessionApi(createRpcClient(config, fetchImpl))
}
