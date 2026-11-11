// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import FireworksButton from './FireworksButton.vue'
import { celebrate } from '../lib/celebrate'
import { button, mountComponent, unmountAll } from '../testing'

const context = {
  globalCompositeOperation: '',
  globalAlpha: 1,
  fillStyle: '',
  setTransform: vi.fn(),
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
}

let callbacks: FrameRequestCallback[]

function runFrames(limit: number) {
  let time = 0
  for (let i = 0; i < limit && callbacks.length; i++) {
    time += 50
    callbacks.shift()?.(time)
  }
}

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reduced }) })
}

beforeEach(() => {
  callbacks = []
  for (const mock of Object.values(context)) if (typeof mock === 'function') mock.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callbacks.push(callback))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  setReducedMotion(false)
})

afterEach(() => {
  unmountAll()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('FireworksButton', () => {
  it('has a real button and a decorative, click-through canvas', () => {
    const root = mountComponent(FireworksButton)

    expect(button(root, 'Fireworks').type).toBe('button')
    expect(root.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('is a detonator box with a plunger that goes down every time it is pressed', async () => {
    const root = mountComponent(FireworksButton)
    expect(root.querySelector('.is-pressed')).toBeNull()
    expect(root.querySelector('.detonator .plunger')).not.toBeNull()
    expect(root.querySelector('.detonator text')?.textContent).toBe('TNT')

    button(root, 'Fireworks').click()
    await nextTick()
    const first = root.querySelector('.is-pressed')
    expect(first).not.toBeNull()

    button(root, 'Fireworks').click()
    await nextTick()
    expect(root.querySelector('.is-pressed')).not.toBe(first)
  })

  it('starts a show when a celebration is announced, and presses the plunger by itself', async () => {
    const root = mountComponent(FireworksButton)

    celebrate()
    await nextTick()

    expect(callbacks).toHaveLength(1)
    expect(root.querySelector('.is-pressed')).not.toBeNull()
  })

  it('stops listening for celebrations once it is removed', () => {
    mountComponent(FireworksButton)
    unmountAll()

    celebrate()

    expect(callbacks).toHaveLength(0)
  })

  it('draws nothing until the button is pressed', () => {
    mountComponent(FireworksButton)

    expect(callbacks).toHaveLength(0)
    expect(context.fillRect).not.toHaveBeenCalled()
  })

  it('runs a show on click, then stops and wipes the canvas', () => {
    const root = mountComponent(FireworksButton)

    button(root, 'Fireworks').click()
    expect(callbacks).toHaveLength(1)

    runFrames(2000)

    expect(callbacks).toHaveLength(0)
    expect(context.arc).toHaveBeenCalled()
    expect(context.clearRect).toHaveBeenCalled()
  })

  it('does not start a second animation loop when clicked again mid-show', () => {
    const root = mountComponent(FireworksButton)

    button(root, 'Fireworks').click()
    runFrames(5)
    button(root, 'Fireworks').click()
    button(root, 'Fireworks').click()

    expect(callbacks).toHaveLength(1)
  })

  it('can be started again after a show finished', () => {
    const root = mountComponent(FireworksButton)
    button(root, 'Fireworks').click()
    runFrames(2000)

    button(root, 'Fireworks').click()

    expect(callbacks).toHaveLength(1)
  })

  it('does nothing for people who asked for reduced motion', () => {
    setReducedMotion(true)
    const root = mountComponent(FireworksButton)

    button(root, 'Fireworks').click()

    expect(callbacks).toHaveLength(0)
  })

  it('stops the animation when it is removed', () => {
    const root = mountComponent(FireworksButton)
    button(root, 'Fireworks').click()

    unmountAll()

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })
})
