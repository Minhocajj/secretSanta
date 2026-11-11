import { describe, expect, it, vi } from 'vitest'
import { createSessionApi, readBackendConfig } from './backend'
import { SupabaseSessionApi } from './supabaseSessionApi'

const URL_NAME = 'VITE_SUPABASE_URL'
const KEY_NAME = 'VITE_SUPABASE_PUBLISHABLE_KEY'

const jwt = (role: string) => {
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.signature`
}

const config = (url: unknown, key: unknown) => readBackendConfig({ [URL_NAME]: url, [KEY_NAME]: key })

describe('readBackendConfig', () => {
  it('accepts an https url with a publishable key', () => {
    expect(config(' https://abc.supabase.co/ ', ' sb_publishable_abc ')).toEqual({
      mode: 'supabase',
      url: 'https://abc.supabase.co',
      publishableKey: 'sb_publishable_abc',
    })
  })

  it('accepts a legacy anon JWT', () => {
    expect(config('https://abc.supabase.co', jwt('anon'))).toMatchObject({ mode: 'supabase' })
  })

  it('allows plain http only for a local Supabase', () => {
    expect(config('http://127.0.0.1:54321', 'sb_publishable_abc')).toMatchObject({
      mode: 'supabase',
      url: 'http://127.0.0.1:54321',
    })
    expect(config('http://localhost:54321', 'sb_publishable_abc')).toMatchObject({ mode: 'supabase' })
    expect(config('http://abc.supabase.co', 'sb_publishable_abc')).toMatchObject({ mode: 'unconfigured' })
  })

  it('keeps only the origin of the url', () => {
    expect(config('https://abc.supabase.co/rest/v1/?x=1', 'sb_publishable_abc')).toMatchObject({
      url: 'https://abc.supabase.co',
    })
  })

  it('is unconfigured, listing what is missing, when nothing is set', () => {
    expect(readBackendConfig({})).toEqual({
      mode: 'unconfigured',
      problems: [`${URL_NAME} is missing`, `${KEY_NAME} is missing`],
    })
    expect(config('   ', 42)).toMatchObject({ mode: 'unconfigured' })
  })

  it('rejects a url that is not a url', () => {
    const result = config('abc.supabase.co', 'sb_publishable_abc')

    expect(result).toMatchObject({ mode: 'unconfigured' })
    expect(result.mode === 'unconfigured' && result.problems.join()).toContain(URL_NAME)
  })

  it('refuses secret keys, which must never reach the browser', () => {
    for (const key of ['sb_secret_abc', jwt('service_role')]) {
      const result = config('https://abc.supabase.co', key)

      expect(result.mode).toBe('unconfigured')
      expect(result.mode === 'unconfigured' && result.problems.join()).toContain('secret key')
    }
  })

  it('refuses keys it does not recognise', () => {
    for (const key of ['hello', 'a.b.c', jwt('authenticated')]) {
      expect(config('https://abc.supabase.co', key).mode, key).toBe('unconfigured')
    }
  })
})

describe('createSessionApi', () => {
  it('returns no api while unconfigured', () => {
    expect(createSessionApi({ mode: 'unconfigured', problems: ['x'] })).toBeNull()
  })

  it('wires the supabase api to the configured project', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"id":"s1","admin_token":"t1"}'))
    const api = createSessionApi(
      { mode: 'supabase', url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_abc' },
      fetchImpl,
    )

    expect(api).toBeInstanceOf(SupabaseSessionApi)
    await expect(api?.createSession({ title: 'Party', description: '' })).resolves.toEqual({ id: 's1', adminToken: 't1' })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://abc.supabase.co/rest/v1/rpc/create_session')
  })
})
