<script setup lang="ts">
import type { Participant } from '../types'

defineProps<{ participants: readonly Participant[] }>()
defineEmits<{ remove: [id: number] }>()
</script>

<template>
  <p v-if="!participants.length" class="muted">No participants yet.</p>
  <ul v-else class="participants">
    <li v-for="participant in participants" :key="participant.id" class="participant">
      <div class="participant__info">
        <strong>{{ participant.name }}</strong>
        <span class="muted">{{ participant.email }}</span>
        <span v-if="participant.gift" class="participant__gift">Gift idea: {{ participant.gift }}</span>
      </div>
      <button
        type="button"
        class="btn btn--ghost"
        :aria-label="`Remove ${participant.name}`"
        @click="$emit('remove', participant.id)"
      >
        Remove
      </button>
    </li>
  </ul>
</template>
