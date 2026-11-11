import { afterAll, beforeAll, beforeEach, vi } from 'vitest'
import { describeSessionApiContract } from './sessionApiContract'
import { SupabaseSessionApi } from './supabaseSessionApi'
import { createTestDatabase, type TestDatabase } from './testDatabase'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(async () => {
  await database.reset()
})

afterAll(async () => {
  await database.db.close()
})

describeSessionApiContract('SupabaseSessionApi on the SQL migration', () => new SupabaseSessionApi(database.rpc))
