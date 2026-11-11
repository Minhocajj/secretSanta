// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import SantaPull from './SantaPull.vue'
import { TOTAL_MS } from '../lib/pull'
import { button, mountComponent, unmountAll } from '../testing'

const Host = defineComponent({
  setup: () => () => h(SantaPull, { label: 'Open it' }, { default: () => h('input', { id: 'inner' }) }),
})

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reduced }) })
}

async function flush() {
  for (let i = 0; i < 3; i++) await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})

afterEach(() => {
  unmountAll()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('SantaPull', () => {
  it('shows only the big button at first and keeps the content away', () => {
    const root = mountComponent(Host)

    expect(button(root, 'Open it').className).toContain('btn--huge')
    expect(root.querySelector('#inner')).toBeNull()
    expect(root.querySelector('.santa-layer')).toBeNull()
  })

  it('brings Santa and the content in when the button is pressed', async () => {
    const root = mountComponent(Host)

    button(root, 'Open it').click()
    await flush()

    expect(root.querySelector('.start')).toBeNull()
    expect(root.querySelector('#inner')).not.toBeNull()
    expect(root.querySelector('.santa-layer')?.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('.pull')?.classList.contains('pull--go')).toBe(true)
    expect(root.querySelector('.rope path')?.getAttribute('d')).toMatch(/^M /)
  })

  it('sends Santa away when the pull is done, leaves the content and focuses the first field', async () => {
    const root = mountComponent(Host)
    button(root, 'Open it').click()
    await flush()

    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10)
    await flush()

    expect(root.querySelector('.santa-layer')).toBeNull()
    expect(root.querySelector('#inner')).not.toBeNull()
    expect(root.querySelector('.pull')?.classList.contains('pull--go')).toBe(false)
    expect(document.activeElement?.id).toBe('inner')
  })

  it('does not focus a field on touch screens, so the keyboard stays closed', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('pointer: coarse') }),
    })
    const root = mountComponent(Host)
    button(root, 'Open it').click()
    await flush()

    await vi.advanceTimersByTimeAsync(TOTAL_MS + 10)
    await flush()

    expect(root.querySelector('.santa-layer')).toBeNull()
    expect(root.querySelector('#inner')).not.toBeNull()
    expect(document.activeElement?.id).not.toBe('inner')
  })

  it('does not restart when pressed again mid-pull', async () => {
    const root = mountComponent(Host)
    button(root, 'Open it').click()
    await flush()

    expect(root.querySelectorAll('.santa-layer')).toHaveLength(1)
    expect(root.querySelectorAll('button')).toHaveLength(0)
  })

  it('skips the show for people who asked for reduced motion', async () => {
    setReducedMotion(true)
    const root = mountComponent(Host)

    button(root, 'Open it').click()
    await flush()

    expect(root.querySelector('.santa-layer')).toBeNull()
    expect(root.querySelector('#inner')).not.toBeNull()
    expect(root.querySelector('.pull--pending, .pull--go')).toBeNull()
  })

  it('stops its timer when it is removed mid-pull', async () => {
    const root = mountComponent(Host)
    button(root, 'Open it').click()
    await flush()

    unmountAll()

    expect(vi.getTimerCount()).toBe(0)
  })
})
