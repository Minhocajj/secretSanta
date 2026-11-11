<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { onCelebrate } from '../lib/celebrate'
import { clearShow, createShow, drawShow, isActive, queueRockets, stepShow, type Viewport } from '../lib/fireworks'

const ROCKETS_PER_CLICK = 6
const MAX_QUEUED_ROCKETS = 24
const FIRST_FRAME_SECONDS = 0.016
const MAX_FRAME_SECONDS = 0.05

const canvas = ref<HTMLCanvasElement | null>(null)
const presses = ref(0)
let stopListening: (() => void) | undefined
let show = createShow()
let frame: number | undefined
let lastTime = -1
let viewport: Viewport = { width: 0, height: 0 }
let ctx: CanvasRenderingContext2D | null = null

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function fit(): boolean {
  const element = canvas.value
  if (!element) return false
  const ratio = window.devicePixelRatio || 1
  viewport = { width: window.innerWidth, height: window.innerHeight }
  element.width = Math.round(viewport.width * ratio)
  element.height = Math.round(viewport.height * ratio)
  ctx = element.getContext('2d')
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0)
  return ctx !== null
}

function tick(now: number) {
  const seconds = lastTime < 0 ? FIRST_FRAME_SECONDS : Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastTime) / 1000))
  lastTime = now
  stepShow(show, seconds, viewport, Math.random)

  if (isActive(show)) {
    if (ctx) drawShow(ctx, show, viewport)
    frame = requestAnimationFrame(tick)
    return
  }
  if (ctx) clearShow(ctx, viewport)
  frame = undefined
  show = createShow()
}

function launch() {
  if (prefersReducedMotion()) return
  if (frame === undefined && !fit()) return
  if (show.pending.length + show.rockets.length < MAX_QUEUED_ROCKETS) queueRockets(show, Math.random, ROCKETS_PER_CLICK)
  if (frame === undefined) {
    lastTime = -1
    frame = requestAnimationFrame(tick)
  }
}

function press() {
  presses.value++
  launch()
}

function onResize() {
  if (frame !== undefined) fit()
}

window.addEventListener('resize', onResize)

onMounted(() => {
  stopListening = onCelebrate(press)
})

onBeforeUnmount(() => {
  stopListening?.()
  window.removeEventListener('resize', onResize)
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
})
</script>

<template>
  <div class="fireworks">
    <button type="button" class="detonator" @click="press">
      <span class="visually-hidden">Launch Fireworks</span>
      <svg viewBox="0 0 120 130" aria-hidden="true" focusable="false">
        <g :key="presses" :class="{ 'is-pressed': presses > 0 }">
          <g class="plunger">
            <rect x="54" y="16" width="12" height="46" fill="#aeb7bf" />
            <rect x="54" y="16" width="4" height="46" fill="#e4e9ed" />
            <rect x="18" y="4" width="84" height="14" rx="7" fill="#c8372d" />
            <rect x="24" y="6" width="72" height="4" rx="2" fill="#ff8a7e" />
          </g>
          <g class="box">
            <rect x="8" y="62" width="104" height="62" rx="5" fill="#8a4f22" />
            <rect x="8" y="78" width="104" height="3" fill="#6f3d19" />
            <rect x="8" y="106" width="104" height="3" fill="#6f3d19" />
            <rect x="4" y="56" width="112" height="12" rx="4" fill="#6f3d19" />
            <circle cx="22" cy="62" r="4" fill="#f2c14e" />
            <circle cx="98" cy="62" r="4" fill="#f2c14e" />
            <rect x="24" y="76" width="72" height="32" rx="4" fill="#c8372d" />
            <text x="60" y="101" text-anchor="middle" font-size="24" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#fff">TNT</text>
            <path d="M8 104 Q-2 112 4 124" stroke="#1b2027" stroke-width="3" fill="none" stroke-linecap="round" />
          </g>
        </g>
      </svg>
    </button>
    <canvas ref="canvas" class="fireworks__canvas" aria-hidden="true" />
  </div>
</template>

<style scoped>
.detonator {
  position: fixed;
  right: clamp(8px, 3vw, 40px);
  bottom: 12px;
  z-index: 4;
  width: clamp(72px, 9vw, 104px);
  padding: 0;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 8px;
  filter: drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
  transition: transform 0.15s;
}

.detonator:hover {
  transform: translateY(-3px);
}

.detonator:focus-visible {
  outline: 3px solid var(--gold);
  outline-offset: 3px;
}

.detonator svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.is-pressed .plunger {
  animation: plunge 0.9s ease-in-out;
}

.is-pressed .box {
  animation: jolt 0.4s ease-out 0.12s;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes plunge {
  0%,
  100% {
    transform: translateY(0);
  }

  15%,
  70% {
    transform: translateY(34px);
  }
}

@keyframes jolt {
  0%,
  100% {
    transform: translate(0, 0);
  }

  25% {
    transform: translate(-2px, 1px);
  }

  50% {
    transform: translate(2px, -1px);
  }

  75% {
    transform: translate(-1px, 0);
  }
}

.fireworks__canvas {
  position: fixed;
  inset: 0;
  z-index: 3;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .fireworks {
    display: none;
  }
}
</style>
