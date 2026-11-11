export const NINJA_WIDTH = 80
export const NINJA_HEIGHT = 110

const SHOWN_DEPTH = 70
const CARD_CORNER = 16
const MIN_CARD_WIDTH = 120
const SIDES = ['left', 'right', 'top', 'bottom'] as const

const EDGES = {
  left: { rotation: 90, dx: -1, dy: 0 },
  right: { rotation: -90, dx: 1, dy: 0 },
  top: { rotation: 180, dx: 0, dy: -1 },
  bottom: { rotation: 0, dx: 0, dy: 1 },
} as const

export type Random = () => number
export type Side = (typeof SIDES)[number]

export interface Viewport {
  width: number
  height: number
}

export interface CardBox {
  left: number
  top: number
  width: number
}

export interface EdgeScene {
  kind: 'edge'
  id: number
  side: Side
  x: number
  y: number
  rotation: number
  dx: number
  dy: number
  duration: number
}

export interface CardScene {
  kind: 'card'
  id: number
  left: number
  top: number
  width: number
  x: number
  duration: number
}

export interface DashScene {
  kind: 'dash'
  id: number
  y: number
  from: number
  to: number
  direction: 1 | -1
  rise: number
  duration: number
}

export type Scene = EdgeScene | CardScene | DashScene

const between = (random: Random, min: number, max: number) => min + random() * (max - min)

function edgeScene(random: Random, viewport: Viewport, id: number): EdgeScene {
  const side = SIDES[Math.min(SIDES.length - 1, Math.floor(random() * SIDES.length))]
  const inset = SHOWN_DEPTH - NINJA_HEIGHT / 2
  const along = (length: number) => between(random, length * 0.12, length * 0.88)
  const position = {
    left: () => ({ x: inset, y: along(viewport.height) }),
    right: () => ({ x: viewport.width - inset, y: along(viewport.height) }),
    top: () => ({ x: along(viewport.width), y: inset }),
    bottom: () => ({ x: along(viewport.width), y: viewport.height - inset }),
  }[side]()
  return { kind: 'edge', id, side, ...position, ...EDGES[side], duration: 3200 }
}

function cardScene(random: Random, cards: readonly CardBox[], id: number): CardScene {
  const card = cards[Math.min(cards.length - 1, Math.floor(random() * cards.length))]
  const margin = CARD_CORNER + NINJA_WIDTH / 2
  return {
    kind: 'card',
    id,
    left: card.left,
    top: card.top - NINJA_HEIGHT,
    width: card.width,
    x: between(random, margin, card.width - margin),
    duration: 3000,
  }
}

function dashScene(random: Random, viewport: Viewport, id: number): DashScene {
  const direction = random() < 0.5 ? 1 : -1
  const start = -NINJA_WIDTH
  const end = viewport.width + NINJA_WIDTH
  return {
    kind: 'dash',
    id,
    y: between(random, viewport.height * 0.35, viewport.height * 0.85),
    from: direction === 1 ? start : end,
    to: direction === 1 ? end : start,
    direction,
    rise: between(random, 80, 160),
    duration: 2400,
  }
}

export function pickScene(random: Random, viewport: Viewport, cards: readonly CardBox[], id: number): Scene {
  const usable = cards.filter(
    (card) => card.width >= MIN_CARD_WIDTH && card.top >= NINJA_HEIGHT && card.top <= viewport.height - 40,
  )
  const roll = random()
  if (roll < 0.45 && usable.length) return cardScene(random, usable, id)
  if (roll < 0.8) return edgeScene(random, viewport, id)
  return dashScene(random, viewport, id)
}
