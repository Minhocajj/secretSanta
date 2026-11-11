import { PGlite } from '@electric-sql/pglite'
import { RpcError, type RpcClient } from './rpcClient'

const migrationFiles = import.meta.glob<string>('../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const IDENTIFIER = /^[a-z_]+$/

const BOOTSTRAP_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`

export type TestHeaders = Record<string, string>

export const DEFAULT_TEST_HEADERS: TestHeaders = { 'cf-connecting-ip': '203.0.113.7' }

export interface TestDatabase {
  db: PGlite
  rpc: RpcClient
  setHeaders(headers: TestHeaders | null): void
  setSetting(name: string, value: number): Promise<void>
  asAnon<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  reset(): Promise<void>
}

interface DatabaseErrorShape {
  code: string
  message: string
  detail?: string
  hint?: string
}

const isDatabaseError = (error: unknown): error is DatabaseErrorShape =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string' &&
  typeof (error as { message?: unknown }).message === 'string'

const toRpcError = (error: DatabaseErrorShape) =>
  new RpcError(error.message, {
    status: error.code === '42501' ? 403 : 400,
    code: error.code,
    details: error.detail ?? null,
    hint: error.hint ?? null,
  })

export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite()
  await db.exec(BOOTSTRAP_SQL)
  for (const name of Object.keys(migrationFiles).sort()) await db.exec(migrationFiles[name])

  const defaultSettings = (await db.query<{ name: string; value: number }>('select name, value from private.settings')).rows
  let headers: TestHeaders | null = DEFAULT_TEST_HEADERS

  const rpc: RpcClient = async (fn, args) => {
    if (!IDENTIFIER.test(fn)) throw new Error(`Unexpected function name: ${fn}`)
    const names = Object.keys(args)
    if (!names.every((name) => IDENTIFIER.test(name))) throw new Error('Unexpected argument name')
    const call = `select public.${fn}(${names.map((name, index) => `${name} => $${index + 1}`).join(', ')}) as result`

    try {
      return await db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query("select set_config('request.headers', $1, true)", [JSON.stringify(headers ?? {})])
        const { rows } = await tx.query<{ result: unknown }>(
          call,
          names.map((name) => args[name]),
        )
        const result = rows[0]?.result
        return result === '' || result === undefined ? null : result
      })
    } catch (error) {
      throw isDatabaseError(error) ? toRpcError(error) : error
    }
  }

  return {
    db,
    rpc,
    setHeaders(next) {
      headers = next
    },
    async setSetting(name, value) {
      await db.query('update private.settings set value = $2 where name = $1', [name, value])
    },
    async asAnon<T>(sql: string, params: unknown[] = []) {
      return db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        return (await tx.query<T>(sql, params)).rows
      })
    },
    async reset() {
      headers = DEFAULT_TEST_HEADERS
      await db.exec('truncate private.participants, private.sessions, private.throttle_hits restart identity cascade')
      for (const { name, value } of defaultSettings) {
        await db.query('update private.settings set value = $2 where name = $1', [name, value])
      }
    },
  }
}
