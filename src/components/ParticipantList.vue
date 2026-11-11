<script setup lang="ts">
import type { Participant } from '../types'
import RichText from './RichText'

withDefaults(defineProps<{ participants: readonly Participant[]; removable?: boolean }>(), { removable: true })
defineEmits<{ remove: [id: number] }>()
</script>

<template>
  <p v-if="!participants.length" class="muted">No participants yet.</p>
  <ul v-else class="participants">
    <li v-for="participant in participants" :key="participant.id" class="participant">
      <div class="participant__info">
        <strong>{{ participant.name }}</strong>
        <span class="muted">{{ participant.email }}</span>
        <div v-if="participant.gift" class="participant__gift">
          <span class="participant__gift-label">Gift idea:</span> <RichText :source="participant.gift" />
        </div>
      </div>
      <button
        v-if="removable"
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
