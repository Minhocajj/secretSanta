<script setup lang="ts">
import type { Pair } from '../types'

defineProps<{ pairs: readonly Pair[] }>()
</script>

<template>
  <ol class="pairs">
    <li v-for="pair in pairs" :key="pair.santa">
      <strong class="pairs__santa">{{ pair.santa }}</strong> is Santa for <strong class="pairs__giftee">{{ pair.giftee }}</strong>
    </li>
  </ol>
</template>
