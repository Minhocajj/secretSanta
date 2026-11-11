<script setup lang="ts">
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

    <svg class="tree tree--left" viewBox="0 0 100 140"><use href="#tree" /></svg>
    <svg class="tree tree--right" viewBox="0 0 100 140"><use href="#tree" /></svg>
    <svg class="tree tree--small" viewBox="0 0 100 140"><use href="#tree" /></svg>

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

.tree {
  position: absolute;
  bottom: 28px;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35));
}

.tree--left {
  left: max(-20px, 2vw);
  width: clamp(110px, 18vw, 230px);
}

.tree--right {
  right: max(-10px, 3vw);
  width: clamp(90px, 14vw, 180px);
}

.tree--small {
  right: clamp(110px, 20vw, 280px);
  width: clamp(50px, 7vw, 90px);
  opacity: 0.85;
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

  .bulb {
    animation: none;
  }
}

@media (max-width: 560px) {
  .tree--small {
    display: none;
  }

  .bulb:nth-child(even) {
    display: none;
  }
}
</style>
