export const PULL_MS = 1500
export const EXIT_DELAY_MS = 1750
export const EXIT_MS = 1000
export const TOTAL_MS = EXIT_DELAY_MS + EXIT_MS + 60

export const SANTA_WIDTH = 110
export const SANTA_HEIGHT = 130
export const SANTA_FEET = 36

const ROPE_SLACK = 56
const OFFSCREEN_MARGIN = 24
const HAND = { x: 100, y: 64 } as const
const EDGE_PADDING = 40

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface PullLayout {
  shift: number
  santaX: number
  santaTop: number
  handX: number
  handY: number
  targetX: number
  targetY: number
  exit: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

export function pullLayout(box: Box, viewport: Size): PullLayout {
  const santaX = box.left - ROPE_SLACK - SANTA_WIDTH
  const santaTop = viewport.height - SANTA_FEET - SANTA_HEIGHT
  return {
    shift: viewport.width - box.left + OFFSCREEN_MARGIN,
    santaX,
    santaTop,
    handX: santaX + HAND.x,
    handY: santaTop + HAND.y,
    targetX: box.left,
    targetY: clamp(box.top + box.height / 2, EDGE_PADDING, viewport.height - EDGE_PADDING),
    exit: Math.max(0, santaX + SANTA_WIDTH + OFFSCREEN_MARGIN),
  }
}

export function ropePath({ handX, handY, targetX, targetY }: PullLayout): string {
  const midX = (handX + targetX) / 2
  const sag = Math.max(handY, targetY) + 24
  return `M ${handX} ${handY} Q ${midX} ${sag} ${targetX} ${targetY}`
}
