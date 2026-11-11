// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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

  it('stands three snowmen at the bottom, all at rest at first', () => {
    const root = mountComponent(Backdrop)

    expect(root.querySelectorAll('.snowman')).toHaveLength(3)
    expect(root.querySelector('.snowman[class*="move-"]')).toBeNull()
  })

  it('makes a snowman do a different move each time it is clicked, and leaves the others alone', async () => {
    const root = mountComponent(Backdrop)
    const snowmen = () => root.querySelectorAll<HTMLElement>('.snowman')
    const moves = async () => {
      snowmen()[0].click()
      await nextTick()
      return [...snowmen()[0].classList].find((name) => name.startsWith('move-'))
    }

    expect(await moves()).toBe('move-hop')
    expect(await moves()).toBe('move-wave')
    expect(await moves()).toBe('move-hat')
    expect(await moves()).toBe('move-twirl')
    expect(await moves()).toBe('move-hop')
    expect(snowmen()[1].className).not.toContain('move-')
    expect(snowmen()[2].className).not.toContain('move-')
  })

  it('animates only the tree that was clicked', async () => {
    const root = mountComponent(Backdrop)
    const trees = () => root.querySelectorAll<HTMLElement>('.tree-wrap')
    expect(trees()).toHaveLength(3)
    expect([...trees()].some((tree) => tree.classList.contains('is-active'))).toBe(false)

    trees()[1].click()
    await nextTick()

    expect([...trees()].map((tree) => tree.classList.contains('is-active'))).toEqual([false, true, false])
    expect(trees()[1].querySelectorAll('.clump').length).toBeGreaterThan(3)
  })

  it('restarts the animation when the same tree is clicked again', async () => {
    const root = mountComponent(Backdrop)
    root.querySelectorAll<HTMLElement>('.tree-wrap')[0].click()
    await nextTick()
    const first = root.querySelectorAll('.tree-wrap')[0]

    root.querySelectorAll<HTMLElement>('.tree-wrap')[0].click()
    await nextTick()

    expect(root.querySelectorAll('.tree-wrap')[0]).not.toBe(first)
  })
})
