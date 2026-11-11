<script setup lang="ts">
import { RouterView } from 'vue-router'
import Backdrop from './components/Backdrop.vue'
import FireworksButton from './components/FireworksButton.vue'
import NinjaSanta from './components/NinjaSanta.vue'
</script>

<template>
  <Backdrop />
  <NinjaSanta />
  <FireworksButton />
  <main class="app">
    <header class="hero">
      <img src="/favicon.svg" alt="" width="56" height="56" />
      <h1>Secret Santa</h1>
      <p>Add everyone, roll the dice and let the emails do the rest.</p>
    </header>

    <RouterView />
  </main>
</template>
