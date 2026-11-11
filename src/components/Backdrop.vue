<script setup lang="ts">
import { ref } from 'vue'
import { snowmanMove } from '../lib/friends'

const TREES = ['left', 'right', 'small'] as const
const SNOWMEN = ['a', 'b', 'c'] as const
const CLUMPS = [
  { x: '26%', y: '44%', fall: '52px', delay: '0s' },
  { x: '70%', y: '48%', fall: '48px', delay: '0.08s' },
  { x: '40%', y: '58%', fall: '60px', delay: '0.16s' },
  { x: '60%', y: '66%', fall: '44px', delay: '0.05s' },
  { x: '32%', y: '78%', fall: '40px', delay: '0.2s' },
  { x: '68%', y: '82%', fall: '36px', delay: '0.12s' },
]

const treeClicks = ref(TREES.map(() => 0))
const snowmanClicks = ref(SNOWMEN.map(() => 0))

const FLAKE_COUNT = 56
const BULB_COUNT = 22
const BULB_COLORS = ['red', 'gold', 'green', 'white'] as const

const flakes = Array.from({ length: FLAKE_COUNT }, (_, i) => ({
  left: `${(i * 53) % 100}%`,
  size: `${3 + ((i * 7) % 6)}px`,
  duration: `${10 + ((i * 5) % 11)}s`,
  delay: `-${(i * 11) % 17}s`,
  drift: `${((i * 13) % 60) - 30}px`,
  opacity: 0.45 + (((i * 3) % 6) / 10),
}))

const bulbs = Array.from({ length: BULB_COUNT }, (_, i) => ({
  color: BULB_COLORS[i % BULB_COLORS.length],
  delay: `${((i * 7) % 10) / 5}s`,
  drop: `${i % 2 === 0 ? 0 : 6}px`,
}))
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <div class="lights">
      <span
        v-for="(bulb, index) in bulbs"
        :key="index"
        class="bulb"
        :class="`bulb--${bulb.color}`"
        :style="{ '--delay': bulb.delay, '--drop': bulb.drop }"
      />
    </div>

    <div class="snow">
      <span
        v-for="(flake, index) in flakes"
        :key="index"
        class="flake"
        :style="{
          '--left': flake.left,
          '--size': flake.size,
          '--duration': flake.duration,
          '--delay': flake.delay,
          '--drift': flake.drift,
          '--opacity': flake.opacity,
        }"
      />
    </div>

    <svg class="symbols" width="0" height="0" focusable="false">
      <defs>
        <symbol id="tree" viewBox="0 0 100 140">
          <rect x="44" y="122" width="12" height="16" rx="2" fill="#5a3a22" />
          <polygon points="50,62 8,126 92,126" fill="#16603c" />
          <polygon points="50,36 16,92 84,92" fill="#1d7447" />
          <polygon points="50,14 26,60 74,60" fill="#25905a" />
          <path d="M50 0 L53.5 8 L62 8.5 L55.5 14 L57.5 22 L50 17.5 L42.5 22 L44.5 14 L38 8.5 L46.5 8 Z" fill="#f2c14e" />
          <circle cx="46" cy="42" r="3.4" fill="#e04b3f" />
          <circle cx="56" cy="52" r="3.4" fill="#f2c14e" />
          <circle cx="40" cy="74" r="3.6" fill="#f2c14e" />
          <circle cx="60" cy="82" r="3.6" fill="#e04b3f" />
          <circle cx="36" cy="104" r="4" fill="#e04b3f" />
          <circle cx="56" cy="100" r="4" fill="#fff" fill-opacity="0.9" />
          <circle cx="70" cy="114" r="4" fill="#f2c14e" />
          <circle cx="44" cy="118" r="4" fill="#fff" fill-opacity="0.9" />
        </symbol>
      </defs>
    </svg>

    <div
      v-for="(name, index) in TREES"
      :key="`${name}-${treeClicks[index]}`"
      class="tree-wrap"
      :class="[`tree-wrap--${name}`, { 'is-active': treeClicks[index] > 0 }]"
      @click="treeClicks[index]++"
    >
      <svg class="tree" viewBox="0 0 100 140"><use href="#tree" /></svg>
      <span
        v-for="(clump, c) in CLUMPS"
        :key="c"
        class="clump"
        :style="{ '--x': clump.x, '--y': clump.y, '--fall': clump.fall, '--delay': clump.delay }"
      />
    </div>

    <div
      v-for="(name, index) in SNOWMEN"
      :key="`${name}-${snowmanClicks[index]}`"
      class="snowman"
      :class="[`snowman--${name}`, snowmanClicks[index] > 0 && `move-${snowmanMove(index, snowmanClicks[index])}`]"
      @click="snowmanClicks[index]++"
    >
      <svg viewBox="0 -2 80 114">
        <g class="arm arm--left">
          <path d="M24 54 L5 43 M11 46 L6 38" stroke="#6b4423" stroke-width="3" stroke-linecap="round" fill="none" />
        </g>
        <g class="arm arm--right">
          <path d="M56 54 L75 43 M69 46 L74 38" stroke="#6b4423" stroke-width="3" stroke-linecap="round" fill="none" />
        </g>
        <circle cx="40" cy="84" r="27" fill="#f6faff" stroke="#c9d8ea" stroke-width="1.5" />
        <circle cx="40" cy="54" r="20" fill="#f6faff" stroke="#c9d8ea" stroke-width="1.5" />
        <circle cx="40" cy="30" r="15" fill="#f6faff" stroke="#c9d8ea" stroke-width="1.5" />
        <circle cx="40" cy="62" r="2.2" fill="#1b2027" />
        <circle cx="40" cy="72" r="2.2" fill="#1b2027" />
        <circle cx="40" cy="82" r="2.2" fill="#1b2027" />
        <rect class="scarf-tail" x="46" y="46" width="7" height="20" rx="3" fill="#a42b23" />
        <rect x="24" y="42" width="32" height="7" rx="3.5" fill="#c8372d" />
        <circle cx="34.5" cy="25" r="1.9" fill="#1b2027" />
        <circle cx="45.5" cy="25" r="1.9" fill="#1b2027" />
        <polygon points="40,29 57,32 40,35" fill="#f08a24" />
        <circle cx="33" cy="36" r="1.1" fill="#1b2027" />
        <circle cx="36.5" cy="38.4" r="1.1" fill="#1b2027" />
        <circle cx="40" cy="39.2" r="1.1" fill="#1b2027" />
        <circle cx="43.5" cy="38.4" r="1.1" fill="#1b2027" />
        <circle cx="47" cy="36" r="1.1" fill="#1b2027" />
        <g class="hat">
          <rect x="23" y="12" width="34" height="5" rx="2.5" fill="#1f2328" />
          <rect x="29" y="-1" width="22" height="15" rx="2" fill="#1f2328" />
          <rect x="29" y="8" width="22" height="4" fill="#c8372d" />
        </g>
      </svg>
    </div>

    <div class="ground" />
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.symbols {
  position: absolute;
}

.lights {
  position: absolute;
  inset: 0 0 auto;
  display: flex;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 2px solid rgb(0 0 0 / 0.35);
}

.bulb {
  display: block;
  width: 10px;
  height: 14px;
  margin-top: calc(var(--drop) + 2px);
  background: var(--color);
  border-radius: 50% 50% 55% 55%;
  box-shadow: 0 0 10px 2px var(--color);
  animation: twinkle 2.4s ease-in-out var(--delay) infinite;
}

.bulb--red {
  --color: #ff5a4d;
}

.bulb--gold {
  --color: #ffd166;
}

.bulb--green {
  --color: #4fd68b;
}

.bulb--white {
  --color: #fff6dc;
}

.flake {
  position: absolute;
  top: 0;
  left: var(--left);
  width: var(--size);
  height: var(--size);
  background: #fff;
  border-radius: 50%;
  opacity: var(--opacity);
  filter: blur(0.4px);
  animation: fall var(--duration) linear var(--delay) infinite;
}

.tree-wrap,
.snowman {
  position: absolute;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.tree-wrap {
  bottom: 28px;
}

.tree-wrap--left {
  left: max(-20px, 2vw);
  width: clamp(110px, 18vw, 230px);
}

.tree-wrap--right {
  right: clamp(100px, 13vw, 190px);
  width: clamp(90px, 14vw, 180px);
}

.tree-wrap--small {
  right: clamp(250px, 33vw, 480px);
  width: clamp(50px, 7vw, 90px);
  opacity: 0.85;
}

.tree {
  display: block;
  width: 100%;
  height: auto;
  transform-origin: 50% 100%;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
}

.tree-wrap:hover .tree,
.snowman:hover svg {
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35)) brightness(1.1);
}

.clump {
  position: absolute;
  top: var(--y);
  left: var(--x);
  width: 9px;
  height: 7px;
  background: #fff;
  border-radius: 50%;
  opacity: 0;
}

.snowman {
  bottom: 24px;
}

.snowman--a {
  left: clamp(130px, 21vw, 330px);
  width: clamp(56px, 5.5vw, 84px);
}

.snowman--b {
  right: clamp(180px, 20vw, 360px);
  width: clamp(52px, 5vw, 76px);
}

.snowman--c {
  left: clamp(70px, 11vw, 180px);
  width: clamp(40px, 4vw, 62px);
}

.snowman svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  transform-origin: 50% 100%;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.35));
}

.arm--left {
  transform-origin: 24px 54px;
}

.arm--right {
  transform-origin: 56px 54px;
}

.hat {
  transform-origin: 40px 8px;
}

.scarf-tail {
  transform-origin: 49px 46px;
}

.is-active.tree-wrap--left .tree {
  animation:
    sway 1.3s ease-in-out,
    glow 1.3s ease-in-out;
}

.is-active.tree-wrap--right .tree {
  animation:
    tree-hop 1s ease-in-out,
    glow 1s ease-in-out;
}

.is-active.tree-wrap--small .tree {
  animation:
    twirl 1s ease-in-out,
    glow 1s ease-in-out;
}

.is-active .clump {
  animation: dump 0.9s ease-in var(--delay) forwards;
}

.move-hop svg {
  animation: snowman-hop 0.9s ease-in-out;
}

.move-wave svg {
  animation: wiggle 1.6s ease-in-out;
}

.move-wave .arm--left {
  animation: wave-left 1.6s ease-in-out;
}

.move-wave .arm--right {
  animation: wave-right 1.6s ease-in-out;
}

.move-hat .hat {
  animation: hat-trick 1.3s ease-in-out;
}

.move-hat .scarf-tail {
  animation: flap 1.3s ease-in-out;
}

.move-twirl svg {
  animation: twirl 0.9s ease-in-out;
}

.ground {
  position: absolute;
  bottom: -40px;
  left: -10%;
  width: 120%;
  height: 100px;
  background: linear-gradient(180deg, #ffffff 0%, #dbe7f3 100%);
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  box-shadow: 0 -4px 18px rgb(255 255 255 / 0.25);
}

@keyframes sway {
  0%,
  100% {
    transform: rotate(0);
  }

  20% {
    transform: rotate(-5deg);
  }

  40% {
    transform: rotate(4deg);
  }

  60% {
    transform: rotate(-3deg);
  }

  80% {
    transform: rotate(1.5deg);
  }
}

@keyframes tree-hop {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }

  15% {
    transform: translateY(0) scale(1.06, 0.94);
  }

  45% {
    transform: translateY(-34px) scale(0.97, 1.05);
  }

  75% {
    transform: translateY(0) scale(1.05, 0.95);
  }
}

@keyframes twirl {
  from {
    transform: perspective(500px) rotateY(0);
  }

  to {
    transform: perspective(500px) rotateY(360deg);
  }
}

@keyframes glow {
  0%,
  100% {
    filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
  }

  35% {
    filter: drop-shadow(0 0 16px rgb(255 214 102 / 0.95)) brightness(1.25);
  }
}

@keyframes dump {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  to {
    opacity: 0;
    transform: translateY(var(--fall)) scale(0.6);
  }
}

@keyframes snowman-hop {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }

  15% {
    transform: translateY(0) scale(1.08, 0.9);
  }

  45% {
    transform: translateY(-36px) scale(0.95, 1.08);
  }

  75% {
    transform: translateY(0) scale(1.1, 0.88);
  }
}

@keyframes wiggle {
  0%,
  100% {
    transform: rotate(0);
  }

  25% {
    transform: rotate(-4deg);
  }

  75% {
    transform: rotate(4deg);
  }
}

@keyframes wave-left {
  0%,
  100% {
    transform: rotate(0);
  }

  20%,
  60% {
    transform: rotate(32deg);
  }

  40%,
  80% {
    transform: rotate(-12deg);
  }
}

@keyframes wave-right {
  0%,
  100% {
    transform: rotate(0);
  }

  20%,
  60% {
    transform: rotate(-32deg);
  }

  40%,
  80% {
    transform: rotate(12deg);
  }
}

@keyframes hat-trick {
  0%,
  100% {
    transform: translateY(0) rotate(0);
  }

  30% {
    transform: translateY(-30px) rotate(0);
  }

  65% {
    transform: translateY(-30px) rotate(360deg);
  }

  90% {
    transform: translateY(0) rotate(360deg);
  }
}

@keyframes flap {
  0%,
  100% {
    transform: rotate(0);
  }

  25%,
  75% {
    transform: rotate(-18deg);
  }

  50% {
    transform: rotate(14deg);
  }
}

@keyframes fall {
  from {
    transform: translate3d(0, -4vh, 0);
  }

  to {
    transform: translate3d(var(--drift), 104vh, 0);
  }
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flake {
    display: none;
  }

  .tree-wrap *,
  .snowman * {
    animation: none !important;
  }

  .tree-wrap,
  .snowman {
    cursor: default;
  }

  .bulb {
    animation: none;
  }
}

@media (max-width: 560px) {
  .tree-wrap--small,
  .snowman--b,
  .snowman--c {
    display: none;
  }

  .bulb:nth-child(even) {
    display: none;
  }
}
</style>
