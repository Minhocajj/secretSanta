<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { pickScene, type CardBox, type Scene } from '../lib/ninja'

const FIRST_DELAY_MS = [2500, 5000] as const
const GAP_MS = [3000, 14000] as const

const scene = ref<Scene | null>(null)
let nextId = 0
let timer: number | undefined

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function cardBoxes(): CardBox[] {
  const cards = [...document.querySelectorAll<HTMLElement>('.card')]
  const withInputs = cards.filter((card) => card.querySelector('input, textarea'))
  return (withInputs.length ? withInputs : cards).map((card) => {
    const { left, top, width } = card.getBoundingClientRect()
    return { left, top, width }
  })
}

function schedule([min, max]: readonly [number, number]) {
  timer = window.setTimeout(show, min + Math.random() * (max - min))
}

function show() {
  if (document.hidden || prefersReducedMotion()) {
    schedule(GAP_MS)
    return
  }
  const next = pickScene(Math.random, { width: window.innerWidth, height: window.innerHeight }, cardBoxes(), ++nextId)
  scene.value = next
  timer = window.setTimeout(() => {
    scene.value = null
    schedule(GAP_MS)
  }, next.duration)
}

function dismissAnchoredScene() {
  if (scene.value?.kind === 'card') scene.value = null
}

onMounted(() => {
  schedule(FIRST_DELAY_MS)
  window.addEventListener('scroll', dismissAnchoredScene, { passive: true })
  window.addEventListener('resize', dismissAnchoredScene)
})

onBeforeUnmount(() => {
  window.clearTimeout(timer)
  window.removeEventListener('scroll', dismissAnchoredScene)
  window.removeEventListener('resize', dismissAnchoredScene)
})
</script>

<template>
  <div class="ninja-root" aria-hidden="true">
    <svg class="ninja-symbols" width="0" height="0" focusable="false">
      <defs>
        <symbol id="ninja-santa" viewBox="0 0 80 110">
          <rect x="52" y="26" width="4" height="54" rx="2" fill="#aab4bd" transform="rotate(26 54 54)" />
          <rect x="50" y="76" width="8" height="5" rx="1" fill="#c8372d" transform="rotate(26 54 54)" />
          <rect x="29" y="82" width="9" height="22" rx="3" fill="#15191f" />
          <rect x="42" y="82" width="9" height="22" rx="3" fill="#15191f" />
          <rect x="27" y="100" width="12" height="7" rx="3" fill="#0b0d11" />
          <rect x="41" y="100" width="12" height="7" rx="3" fill="#0b0d11" />
          <path d="M26 58 Q40 50 54 58 L56 86 H24 Z" fill="#1b2027" />
          <rect x="24" y="76" width="32" height="6" fill="#c8372d" />
          <rect x="45" y="76" width="6" height="12" rx="2" fill="#a42b23" />
          <path d="M27 60 L14 70 L18 76 L30 68 Z" fill="#1b2027" />
          <path d="M53 60 L66 70 L62 76 L50 68 Z" fill="#1b2027" />
          <circle cx="14" cy="74" r="4" fill="#0b0d11" />
          <circle cx="64" cy="74" r="4" fill="#0b0d11" />
          <path d="M64 63 L66 70 L73 72 L66 74 L64 81 L62 74 L55 72 L62 70 Z" fill="#cfd6dc" />
          <circle cx="40" cy="38" r="17" fill="#1b2027" />
          <rect x="27" y="33" width="26" height="10" rx="5" fill="#f2c9a2" />
          <circle cx="34" cy="38.5" r="2.2" fill="#1b2027" />
          <circle cx="46" cy="38.5" r="2.2" fill="#1b2027" />
          <path d="M29 33 L38 36.5 M51 33 L42 36.5" stroke="#1b2027" stroke-width="2" stroke-linecap="round" />
          <path d="M26 42 Q40 47 54 42 Q54 62 40 71 Q26 62 26 42 Z" fill="#fff" />
          <path d="M32 44 Q40 50 48 44 Q40 41.5 32 44 Z" fill="#f4f4f4" stroke="#d6dbe0" stroke-width="0.8" />
          <path d="M23 29 Q27 8 47 6 Q60 6 69 24 Q58 14 57 29 Z" fill="#d6382d" />
          <rect x="22" y="26" width="36" height="8" rx="4" fill="#fff" />
          <circle cx="69" cy="25" r="5" fill="#fff" />
        </symbol>
      </defs>
    </svg>

    <div
      v-if="scene?.kind === 'edge'"
      :key="scene.id"
      class="ninja ninja--edge"
      :style="{
        '--x': `${scene.x}px`,
        '--y': `${scene.y}px`,
        '--rot': `${scene.rotation}deg`,
        '--dx': scene.dx,
        '--dy': scene.dy,
        '--duration': `${scene.duration}ms`,
      }"
    >
      <svg class="sprite" viewBox="0 0 80 110"><use href="#ninja-santa" /></svg>
    </div>

    <div
      v-else-if="scene?.kind === 'card'"
      :key="scene.id"
      class="ninja-clip"
      :style="{
        left: `${scene.left}px`,
        top: `${scene.top}px`,
        width: `${scene.width}px`,
        '--x': `${scene.x}px`,
        '--duration': `${scene.duration}ms`,
      }"
    >
      <div class="ninja ninja--card">
        <svg class="sprite" viewBox="0 0 80 110"><use href="#ninja-santa" /></svg>
      </div>
    </div>

    <div
      v-else-if="scene?.kind === 'dash'"
      :key="scene.id"
      class="ninja ninja--dash"
      :style="{
        '--y': `${scene.y}px`,
        '--from': `${scene.from}px`,
        '--to': `${scene.to}px`,
        '--rise': `${scene.rise}px`,
        '--dir': scene.direction,
        '--duration': `${scene.duration}ms`,
      }"
    >
      <div class="dash-arc">
        <svg class="sprite sprite--spin" viewBox="0 0 80 110"><use href="#ninja-santa" /></svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ninja-symbols {
  position: absolute;
}

.ninja,
.ninja-clip {
  position: fixed;
  z-index: 2;
  pointer-events: none;
}

.ninja {
  width: 80px;
  height: 110px;
}

.sprite {
  display: block;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.4));
}

.ninja--edge {
  top: var(--y);
  left: var(--x);
  margin: -55px 0 0 -40px;
  animation: peek var(--duration) ease-in-out forwards;
}

.ninja-clip {
  height: 110px;
  overflow: hidden;
}

.ninja--card {
  position: absolute;
  bottom: 0;
  left: var(--x);
  margin-left: -40px;
  transform-origin: 50% 100%;
  animation: pop var(--duration) ease-in-out forwards;
}

.ninja--dash {
  top: var(--y);
  left: 0;
  margin-top: -55px;
  animation: cross var(--duration) linear forwards;
}

.dash-arc {
  animation: hop var(--duration) linear forwards;
}

.sprite--spin {
  animation: spin var(--duration) linear forwards;
}

@keyframes peek {
  0%,
  100% {
    transform: translate(calc(var(--dx) * 150px), calc(var(--dy) * 150px)) rotate(var(--rot));
  }

  15%,
  75% {
    transform: translate(0, 0) rotate(var(--rot));
  }

  30% {
    transform: translate(0, 0) rotate(calc(var(--rot) + 8deg));
  }

  45% {
    transform: translate(0, 0) rotate(calc(var(--rot) - 8deg));
  }

  60% {
    transform: translate(0, 0) rotate(calc(var(--rot) + 4deg));
  }
}

@keyframes pop {
  0%,
  100% {
    transform: translateY(105%);
  }

  18%,
  80% {
    transform: translateY(0) rotate(0deg);
  }

  35% {
    transform: translateY(0) rotate(-7deg);
  }

  55% {
    transform: translateY(0) rotate(7deg);
  }
}

@keyframes cross {
  from {
    transform: translateX(var(--from));
  }

  to {
    transform: translateX(var(--to));
  }
}

@keyframes hop {
  0%,
  100% {
    transform: translateY(0);
  }

  0% {
    animation-timing-function: ease-out;
  }

  50% {
    transform: translateY(calc(var(--rise) * -1));
    animation-timing-function: ease-in;
  }
}

@keyframes spin {
  to {
    transform: rotate(calc(var(--dir) * 720deg));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ninja-root {
    display: none;
  }
}
</style>
