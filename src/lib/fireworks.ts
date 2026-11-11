export const PALETTE = ['#ff5a4d', '#ffd166', '#4fd68b', '#7cc7ff', '#ff9ed2', '#ffffff'] as const

const GRAVITY = 180
const DRAG = 1.4
const MAX_SPARKS = 3000

export type Random = () => number

export interface Viewport {
  width: number
  height: number
}

interface Rocket {
  x: number
  y: number
  speed: number
  targetY: number
  color: string
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export interface Show {
  time: number
  pending: number[]
  rockets: Rocket[]
  sparks: Spark[]
}

export interface Canvas2D {
  globalCompositeOperation: string
  globalAlpha: number
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, width: number, height: number): void
  clearRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  arc(x: number, y: number, radius: number, start: number, end: number): void
  fill(): void
}

const between = (random: Random, min: number, max: number) => min + random() * (max - min)
const pick = <T>(random: Random, items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))]

export const createShow = (): Show => ({ time: 0, pending: [], rockets: [], sparks: [] })

export const isActive = (show: Show) => show.pending.length + show.rockets.length + show.sparks.length > 0

export function queueRockets(show: Show, random: Random, count: number, spreadSeconds = 2.4) {
  for (let i = 0; i < count; i++) show.pending.push(show.time + random() * spreadSeconds)
  show.pending.sort((a, b) => a - b)
}

function launch(random: Random, viewport: Viewport): Rocket {
  return {
    x: between(random, viewport.width * 0.12, viewport.width * 0.88),
    y: viewport.height,
    speed: viewport.height * between(random, 0.75, 0.95),
    targetY: viewport.height * between(random, 0.15, 0.45),
    color: pick(random, PALETTE),
  }
}

function burst(random: Random, rocket: Rocket): Spark[] {
  const count = 70 + Math.floor(random() * 30)
  const accent = pick(random, PALETTE)
  const sparks: Spark[] = []
  for (let i = 0; i < count; i++) {
    const angle = ((Math.PI * 2) / count) * i + random() * 0.2
    const speed = between(random, 60, 260)
    const life = between(random, 1.1, 2)
    sparks.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: between(random, 1.5, 3),
      color: i % 3 === 0 ? accent : rocket.color,
    })
  }
  return sparks
}

export function stepShow(show: Show, seconds: number, viewport: Viewport, random: Random) {
  show.time += seconds

  while (show.pending.length && show.pending[0] <= show.time) {
    show.pending.shift()
    show.rockets.push(launch(random, viewport))
  }

  const rising: Rocket[] = []
  for (const rocket of show.rockets) {
    rocket.y -= rocket.speed * seconds
    if (rocket.y <= rocket.targetY) {
      if (show.sparks.length < MAX_SPARKS) show.sparks.push(...burst(random, rocket))
    } else {
      rising.push(rocket)
    }
  }
  show.rockets = rising

  const drag = Math.exp(-DRAG * seconds)
  for (const spark of show.sparks) {
    spark.life -= seconds
    spark.vx *= drag
    spark.vy = spark.vy * drag + GRAVITY * seconds
    spark.x += spark.vx * seconds
    spark.y += spark.vy * seconds
  }
  show.sparks = show.sparks.filter((spark) => spark.life > 0)
}

export function drawShow(ctx: Canvas2D, show: Show, viewport: Viewport) {
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  ctx.globalCompositeOperation = 'lighter'
  for (const rocket of show.rockets) {
    ctx.fillStyle = rocket.color
    ctx.fillRect(rocket.x - 1.5, rocket.y, 3, 14)
  }
  for (const spark of show.sparks) {
    ctx.globalAlpha = Math.max(0, spark.life / spark.maxLife)
    ctx.fillStyle = spark.color
    ctx.beginPath()
    ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

export function clearShow(ctx: Canvas2D, viewport: Viewport) {
  ctx.clearRect(0, 0, viewport.width, viewport.height)
}
