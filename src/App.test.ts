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

  it.each(['/', '/join/some-id', '/admin/some-id', '/nowhere/at/all'])('opens the quick flow for %s', async (path) => {
    const { root, router } = await mountAt(path)

    expect(router.currentRoute.value.path).toBe('/quick')
    expect(root.querySelector('#participants-title')).not.toBeNull()
  })
})
