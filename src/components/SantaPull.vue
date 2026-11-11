<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  EXIT_DELAY_MS,
  EXIT_MS,
  PULL_MS,
  SANTA_HEIGHT,
  SANTA_WIDTH,
  TOTAL_MS,
  pullLayout,
  ropePath,
  type PullLayout,
} from '../lib/pull'

defineProps<{ label: string }>()
const emit = defineEmits<{ opened: [] }>()

type Stage = 'idle' | 'pulling' | 'open'

const stage = ref<Stage>('idle')
const panel = ref<HTMLElement | null>(null)
const layout = ref<PullLayout | null>(null)
let timer: number | undefined

const timing = {
  '--pull-ms': `${PULL_MS}ms`,
  '--exit-delay': `${EXIT_DELAY_MS}ms`,
  '--exit-ms': `${EXIT_MS}ms`,
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const hasCoarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches ?? false

const panelStyle = computed(() => (layout.value ? { ...timing, '--shift': `${layout.value.shift}px` } : undefined))
const layerStyle = computed(() =>
  layout.value ? { ...timing, '--shift': `${layout.value.shift}px`, '--exit': `${layout.value.exit}px` } : undefined,
)
const rope = computed(() => (layout.value ? ropePath(layout.value) : ''))

function focusFirstField() {
  if (hasCoarsePointer()) return
  if (document.activeElement && document.activeElement !== document.body) return
  panel.value?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
}

async function finish() {
  window.clearTimeout(timer)
  stage.value = 'open'
  layout.value = null
  emit('opened')
  await nextTick()
  focusFirstField()
}

async function start() {
  if (stage.value !== 'idle') return
  stage.value = 'pulling'
  if (prefersReducedMotion()) {
    await finish()
    return
  }
  await nextTick()
  if (!panel.value) {
    await finish()
    return
  }
  layout.value = pullLayout(panel.value.getBoundingClientRect(), {
    width: window.innerWidth,
    height: window.innerHeight,
  })
  timer = window.setTimeout(finish, TOTAL_MS)
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div v-if="stage === 'idle'" class="start">
    <button type="button" class="btn btn--primary btn--huge" @click="start">{{ label }}</button>
  </div>

  <template v-else>
    <div
      ref="panel"
      class="pull"
      :class="{ 'pull--pending': stage === 'pulling' && !layout, 'pull--go': stage === 'pulling' && layout }"
      :style="panelStyle"
    >
      <slot />
    </div>

    <div v-if="stage === 'pulling' && layout" class="santa-layer" aria-hidden="true" :style="layerStyle">
      <div class="train">
        <svg class="rope" focusable="false">
          <path :d="rope" fill="none" stroke="#d9b27c" stroke-width="3" stroke-linecap="round" />
        </svg>
        <div
          class="santa"
          :style="{
            left: `${layout.santaX}px`,
            top: `${layout.santaTop}px`,
            width: `${SANTA_WIDTH}px`,
            height: `${SANTA_HEIGHT}px`,
          }"
        >
          <svg class="santa__sprite" viewBox="0 0 110 130" focusable="false">
            <path d="M58 58 L96 64" stroke="#d6382d" stroke-width="11" stroke-linecap="round" />
            <circle cx="95" cy="64" r="6.5" fill="#fff" />
            <circle cx="101" cy="64" r="5" fill="#1b2027" />
            <g class="leg leg--back">
              <rect x="50" y="88" width="14" height="34" rx="5" fill="#a42b23" />
              <rect x="46" y="116" width="26" height="12" rx="4" fill="#15191f" />
            </g>
            <g class="leg leg--front">
              <rect x="36" y="88" width="14" height="34" rx="5" fill="#d6382d" />
              <rect x="30" y="116" width="26" height="12" rx="4" fill="#15191f" />
            </g>
            <rect x="36" y="48" width="46" height="52" rx="16" fill="#d6382d" />
            <rect x="34" y="92" width="50" height="10" rx="5" fill="#fff" />
            <rect x="36" y="78" width="46" height="8" fill="#1b2027" />
            <rect x="42" y="76" width="12" height="12" rx="2" fill="#f2c14e" />
            <path d="M44 58 L26 74" stroke="#d6382d" stroke-width="11" stroke-linecap="round" />
            <circle cx="25" cy="75" r="5.5" fill="#1b2027" />
            <circle cx="52" cy="32" r="16" fill="#f2c9a2" />
            <path d="M36 34 Q40 64 56 64 Q68 54 68 36 Q52 46 36 34 Z" fill="#fff" />
            <circle cx="42" cy="28" r="2" fill="#1b2027" />
            <circle cx="52" cy="28" r="2" fill="#1b2027" />
            <circle cx="36" cy="34" r="3.6" fill="#f0a0a0" />
            <path d="M34 22 Q38 0 62 5 Q78 10 86 32 Q72 18 68 27 Z" fill="#d6382d" />
            <rect x="34" y="22" width="34" height="9" rx="4.5" fill="#fff" />
            <circle cx="86" cy="32" r="6" fill="#fff" />
          </svg>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.start {
  display: grid;
  place-items: center;
  min-height: 46vh;
}

.btn--huge {
  padding: 24px 56px;
  font-size: clamp(1.4rem, 4vw, 2rem);
  border-radius: 999px;
  box-shadow:
    0 10px 0 var(--red-dark),
    0 18px 30px rgb(0 0 0 / 0.4);
  transition:
    transform 0.12s,
    box-shadow 0.12s,
    background-color 0.15s;
  animation: beat 2.4s ease-in-out infinite;
}

.btn--huge:hover:not(:disabled) {
  transform: translateY(-2px);
}

.btn--huge:active:not(:disabled) {
  box-shadow:
    0 4px 0 var(--red-dark),
    0 8px 14px rgb(0 0 0 / 0.4);
  transform: translateY(6px);
}

.pull--pending {
  visibility: hidden;
}

.pull--go {
  animation: pull-in var(--pull-ms) cubic-bezier(0.22, 0.85, 0.3, 1) both;
}

.santa-layer {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.train {
  position: absolute;
  inset: 0;
  animation: pull-in var(--pull-ms) cubic-bezier(0.22, 0.85, 0.3, 1) both;
}

.rope {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: rope-out 0.25s ease-in var(--pull-ms) both;
}

.santa {
  position: absolute;
  animation: walk-off var(--exit-ms) ease-in var(--exit-delay) both;
}

.santa__sprite {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.4));
  animation: bob 0.36s ease-in-out infinite alternate;
}

.leg--front {
  transform-origin: 43px 88px;
  animation: step 0.36s ease-in-out infinite alternate;
}

.leg--back {
  transform-origin: 57px 88px;
  animation: step 0.36s ease-in-out infinite alternate-reverse;
}

@keyframes pull-in {
  from {
    transform: translateX(var(--shift));
  }

  to {
    transform: translateX(0);
  }
}

@keyframes walk-off {
  to {
    transform: translateX(calc(var(--exit) * -1));
  }
}

@keyframes rope-out {
  to {
    opacity: 0;
  }
}

@keyframes bob {
  to {
    transform: translateY(-5px);
  }
}

@keyframes step {
  from {
    transform: rotate(-26deg);
  }

  to {
    transform: rotate(26deg);
  }
}

@keyframes beat {
  0%,
  100% {
    scale: 1;
  }

  50% {
    scale: 1.04;
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn--huge {
    animation: none;
  }
}
</style>
