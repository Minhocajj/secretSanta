// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import Backdrop from './Backdrop.vue'
import { mountComponent, unmountAll } from '../testing'

afterEach(unmountAll)

describe('Backdrop', () => {
  it('is purely decorative: hidden from assistive technology and with nothing focusable', () => {
    const root = mountComponent(Backdrop)
    const backdrop = root.querySelector('.backdrop')

    expect(backdrop?.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop?.querySelector('a, button, input, [tabindex]')).toBeNull()
  })

  it('draws snow, string lights and trees', () => {
    const root = mountComponent(Backdrop)

    expect(root.querySelectorAll('.flake').length).toBeGreaterThan(20)
    expect(root.querySelectorAll('.bulb').length).toBeGreaterThan(10)
    expect(root.querySelectorAll('.tree').length).toBeGreaterThanOrEqual(2)
  })
})
