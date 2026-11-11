import { describe, expect, it, vi } from 'vitest'
import { PALETTE, clearShow, createShow, drawShow, isActive, queueRockets, stepShow, type Canvas2D } from './fireworks'

const viewport = { width: 1000, height: 800 }

function seeded(seed = 7) {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

function run(show: ReturnType<typeof createShow>, seconds: number, random = seeded()) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) stepShow(show, 0.05, viewport, random)
}

describe('fireworks show', () => {
  it('is idle until rockets are queued', () => {
    const show = createShow()
    expect(isActive(show)).toBe(false)

    queueRockets(show, seeded(), 5)

    expect(show.pending).toHaveLength(5)
    expect([...show.pending].sort((a, b) => a - b)).toEqual(show.pending)
    expect(isActive(show)).toBe(true)
  })

  it('launches rockets from the bottom, which rise and burst into sparks', () => {
    const show = createShow()
    queueRockets(show, seeded(), 3, 0.1)

    stepShow(show, 0.2, viewport, seeded())
    expect(show.rockets.length).toBeGreaterThan(0)
    for (const rocket of show.rockets) {
      expect(rocket.x).toBeGreaterThan(0)
      expect(rocket.x).toBeLessThan(viewport.width)
    }

    run(show, 1.5)
    expect(show.sparks.length).toBeGreaterThan(100)
    for (const spark of show.sparks) {
      expect(PALETTE).toContain(spark.color)
      expect(Number.isFinite(spark.x) && Number.isFinite(spark.y)).toBe(true)
    }
  })

  it('always burns out completely', () => {
    const show = createShow()
    queueRockets(show, seeded(), 12)

    run(show, 15)

    expect(isActive(show)).toBe(false)
    expect(show.sparks).toEqual([])
  })

  it('keeps the number of sparks bounded however often it is triggered', () => {
    const show = createShow()
    const random = seeded(3)
    for (let i = 0; i < 40; i++) queueRockets(show, random, 6, 0.2)

    run(show, 3, random)

    expect(show.sparks.length).toBeLessThan(3200)
  })
})

describe('drawing', () => {
  function fakeContext() {
    return {
      globalCompositeOperation: '',
      globalAlpha: 1,
      fillStyle: '',
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } satisfies Canvas2D
  }

  it('fades old frames, draws each spark and restores the canvas state', () => {
    const show = createShow()
    queueRockets(show, seeded(), 2, 0.1)
    run(show, 1.5)
    const ctx = fakeContext()

    drawShow(ctx, show, viewport)

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1000, 800)
    expect(ctx.arc).toHaveBeenCalledTimes(show.sparks.length)
    expect(ctx.globalAlpha).toBe(1)
    expect(ctx.globalCompositeOperation).toBe('source-over')
  })

  it('wipes the whole canvas when the show is over', () => {
    const ctx = fakeContext()

    clearShow(ctx, viewport)

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1000, 800)
  })
})
