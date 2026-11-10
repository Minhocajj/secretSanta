<script setup lang="ts">
import { computed } from 'vue'
import type { Delivery, DeliveryStatus } from '../types'

const props = defineProps<{ deliveries: readonly Delivery[] }>()

const LABELS: Record<DeliveryStatus, string> = {
  queued: 'Waiting',
  sending: 'Sending...',
  sent: 'Sent',
  failed: 'Failed',
}

const total = computed(() => props.deliveries.length)
const sent = computed(() => props.deliveries.filter(({ status }) => status === 'sent').length)
const failed = computed(() => props.deliveries.filter(({ status }) => status === 'failed').length)
const summary = computed(() => {
  const base = `${sent.value} of ${total.value} emails sent`
  return failed.value ? `${base}, ${failed.value} failed` : base
})
</script>

<template>
  <progress class="progress" :max="total" :value="sent + failed" aria-label="Sending progress" />
  <p class="summary" role="status">{{ summary }}</p>
  <ul class="deliveries">
    <li v-for="delivery in deliveries" :key="delivery.participantId" class="delivery">
      <span class="delivery__who">
        <strong>{{ delivery.name }}</strong> <span class="muted">{{ delivery.email }}</span>
      </span>
      <span :class="['badge', `badge--${delivery.status}`]">{{ LABELS[delivery.status] }}</span>
      <span v-if="delivery.error" class="delivery__error">{{ delivery.error }}</span>
    </li>
  </ul>
</template>
