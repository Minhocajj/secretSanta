import { describe, expect, it } from 'vitest'
import { NINJA_HEIGHT, pickScene, type CardBox } from './ninja'

const viewport = { width: 1000, height: 800 }
const card: CardBox = { left: 140, top: 300, width: 720 }

const fixed = (value: number) => () => value

describe('pickScene', () => {
  it('pops out from behind the top edge of a card, inside its width', () => {
    const scene = pickScene(fixed(0.1), viewport, [card], 1)

    expect(scene).toMatchObject({ kind: 'card', left: 140, top: 300 - NINJA_HEIGHT, width: 720 })
    if (scene.kind !== 'card') throw new Error('expected a card scene')
    expect(scene.x).toBeGreaterThan(0)
    expect(scene.x).toBeLessThan(720)
  })

  it('falls back to a window edge when no card has room above it', () => {
    const crammed: CardBox = { left: 0, top: 20, width: 720 }

    expect(pickScene(fixed(0.1), viewport, [crammed], 1).kind).toBe('edge')
    expect(pickScene(fixed(0.1), viewport, [], 1).kind).toBe('edge')
  })

  it('ignores cards that are too narrow or below the visible window', () => {
    const narrow: CardBox = { left: 0, top: 300, width: 80 }
    const offscreen: CardBox = { left: 0, top: 790, width: 720 }

    expect(pickScene(fixed(0.1), viewport, [narrow, offscreen], 1).kind).toBe('edge')
  })

  it.each([
    [0, 'left', 90, -1, 0],
    [0.3, 'right', -90, 1, 0],
    [0.6, 'top', 180, 0, -1],
    [0.99, 'bottom', 0, 0, 1],
  ] as const)('with side roll %s the ninja peeks in from the %s edge', (sideRoll, side, rotation, dx, dy) => {
    const values = [0.5, sideRoll, 0.5]
    let index = 0

    const scene = pickScene(() => values[index++], viewport, [], 1)

    expect(scene).toMatchObject({ kind: 'edge', side, rotation, dx, dy })
    if (scene.kind !== 'edge') throw new Error('expected an edge scene')
    expect(scene.x).toBeGreaterThanOrEqual(0)
    expect(scene.x).toBeLessThanOrEqual(viewport.width)
    expect(scene.y).toBeGreaterThanOrEqual(0)
    expect(scene.y).toBeLessThanOrEqual(viewport.height)
  })

  it('dashes right across the window, starting and ending outside it', () => {
    const scene = pickScene(fixed(0.9), viewport, [card], 1)

    expect(scene.kind).toBe('dash')
    if (scene.kind !== 'dash') throw new Error('expected a dash scene')
    expect(scene.direction).toBe(-1)
    expect(scene.from).toBeGreaterThan(viewport.width)
    expect(scene.to).toBeLessThan(0)
    expect(scene.y).toBeGreaterThan(0)
    expect(scene.y).toBeLessThan(viewport.height)
  })

  it('numbers every scene so the animation restarts', () => {
    expect(pickScene(fixed(0.5), viewport, [], 7).id).toBe(7)
  })
})
