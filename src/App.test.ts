// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { createAppRouter } from './router'
import { mountComponent, unmountAll } from './testing'

afterEach(unmountAll)

async function mountAt(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  const root = mountComponent(App, {}, [router])
  return { root, router }
}

describe('App', () => {
  it('wraps the quick flow in the shared header at /quick', async () => {
    const { root, router } = await mountAt('/quick')

    expect(router.currentRoute.value.path).toBe('/quick')
    expect(root.querySelector('.hero h1')?.textContent).toBe('Secret Santa')
    expect(root.querySelector('#participants-title')).not.toBeNull()
    expect(root.querySelector('#participant-name')).not.toBeNull()
  })

  it('keeps /join/:id as its own page', async () => {
    const { root, router } = await mountAt('/join/some-id')

    expect(router.currentRoute.value.path).toBe('/join/some-id')
    expect(root.querySelector('#participants-title')).toBeNull()
  })

  it('opens the home page at /', async () => {
    const { root, router } = await mountAt('/')

    expect(router.currentRoute.value.path).toBe('/')
    expect(root.querySelector('#create-title')).not.toBeNull()
    expect(root.querySelector('a[href="/quick"]')).not.toBeNull()
  })

  it('keeps /admin/:id as its own page', async () => {
    const { root, router } = await mountAt('/admin/some-id')

    expect(router.currentRoute.value.path).toBe('/admin/some-id')
    expect(root.querySelector('#admin-title')).not.toBeNull()
    expect(root.querySelector('#participants-title')).toBeNull()
  })

  it('opens the home page for unknown paths', async () => {
    const { root, router } = await mountAt('/nowhere/at/all')

    expect(router.currentRoute.value.path).toBe('/')
    expect(root.querySelector('#create-title')).not.toBeNull()
  })
})
