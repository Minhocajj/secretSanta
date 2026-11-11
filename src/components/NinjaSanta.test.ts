// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import NinjaSanta from './NinjaSanta.vue'
import { mountComponent, unmountAll } from '../testing'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: reduced }),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  setHidden(false)
  setReducedMotion(false)
})

afterEach(() => {
  unmountAll()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'hidden')
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('NinjaSanta', () => {
  it('is decorative: hidden from assistive technology and never focusable', () => {
    const root = mountComponent(NinjaSanta)

    expect(root.querySelector('.ninja-root')?.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('a, button, input, [tabindex]')).toBeNull()
  })

  async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms)
    await nextTick()
  }

  it('shows nothing at first, appears after a short wait and goes away again', async () => {
    const root = mountComponent(NinjaSanta)
    expect(root.querySelector('.ninja')).toBeNull()

    await advance(5000)
    expect(root.querySelectorAll('.ninja')).toHaveLength(1)

    await advance(3300)
    expect(root.querySelector('.ninja')).toBeNull()
  })

  it('comes back again later', async () => {
    const root = mountComponent(NinjaSanta)

    await advance(5000 + 3300)
    expect(root.querySelector('.ninja')).toBeNull()

    await advance(9000)
    expect(root.querySelectorAll('.ninja')).toHaveLength(1)
  })

  it('stays away while the tab is hidden', () => {
    setHidden(true)
    const root = mountComponent(NinjaSanta)

    vi.advanceTimersByTime(60_000)

    expect(root.querySelector('.ninja')).toBeNull()
  })

  it('stays away for people who asked for reduced motion', () => {
    setReducedMotion(true)
    const root = mountComponent(NinjaSanta)

    vi.advanceTimersByTime(60_000)

    expect(root.querySelector('.ninja')).toBeNull()
  })

  it('stops all timers when it is removed', () => {
    mountComponent(NinjaSanta)
    vi.advanceTimersByTime(5000)

    unmountAll()

    expect(vi.getTimerCount()).toBe(0)
  })
})
