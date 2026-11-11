import { describe, expect, it } from 'vitest'
import { SANTA_FEET, SANTA_HEIGHT, SANTA_WIDTH, pullLayout, ropePath } from './pull'

const viewport = { width: 1400, height: 900 }
const card = { left: 340, top: 300, width: 720, height: 360 }

describe('pullLayout', () => {
  it('starts the content just past the right edge of the window', () => {
    const layout = pullLayout(card, viewport)

    expect(card.left + layout.shift).toBeGreaterThan(viewport.width)
  })

  it('puts Santa on the snow, left of the content, with the rope between them', () => {
    const layout = pullLayout(card, viewport)

    expect(layout.santaTop + SANTA_HEIGHT).toBe(viewport.height - SANTA_FEET)
    expect(layout.santaX + SANTA_WIDTH).toBeLessThan(card.left)
    expect(layout.handX).toBeLessThan(layout.targetX)
    expect(layout.targetX).toBe(card.left)
  })

  it('ties the rope to the middle of the content, kept inside the window', () => {
    expect(pullLayout(card, viewport).targetY).toBe(480)
    expect(pullLayout({ ...card, top: -900 }, viewport).targetY).toBe(40)
    expect(pullLayout({ ...card, top: 5000 }, viewport).targetY).toBe(viewport.height - 40)
  })

  it('walks Santa all the way off to the left afterwards, never to the right', () => {
    const wide = pullLayout(card, viewport)
    const narrow = pullLayout({ ...card, left: 16, width: 360 }, { width: 400, height: 800 })

    expect(wide.santaX + SANTA_WIDTH - wide.exit).toBeLessThan(0)
    expect(narrow.exit).toBeGreaterThanOrEqual(0)
  })
})

describe('ropePath', () => {
  it('draws a sagging line from the hand to the content', () => {
    const path = ropePath(pullLayout(card, viewport))

    expect(path).toMatch(/^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ 340 480$/)
  })
})
