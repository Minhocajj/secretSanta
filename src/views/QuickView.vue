<script setup lang="ts">
import DrawPanel from '../components/DrawPanel.vue'
import ParticipantForm from '../components/ParticipantForm.vue'
import ParticipantList from '../components/ParticipantList.vue'
import { useSecretSanta } from '../composables/useSecretSanta'

const santa = useSecretSanta()
const { config, participants, phase, addParticipant, removeParticipant } = santa
</script>

<template>
  <p v-if="config.mode === 'dry-run'" class="banner banner--info" role="status">
    Dry run: the whole flow works, but no email is actually sent. Set <code>VITE_EMAILJS_DRY_RUN=false</code> in
    <code>.env</code> to send for real.
  </p>
  <p v-else-if="config.mode === 'unconfigured'" class="banner banner--warning" role="alert">
    EmailJS is not configured yet, so emails cannot be sent. Copy <code>.env.example</code> to <code>.env</code>, fill in
    the missing values (<code>{{ config.missing.join(', ') }}</code>) and restart <code>npm run dev</code>. Until then
    you can still preview a draw with "Show results to me" checked.
  </p>

  <section v-if="phase === 'edit'" class="card" aria-labelledby="participants-title">
    <h2 id="participants-title">Participants <span class="count">{{ participants.length }}</span></h2>
    <ParticipantForm :participants="participants" :save="addParticipant" />
    <ParticipantList :participants="participants" @remove="removeParticipant" />
  </section>

  <DrawPanel :santa="santa" />
</template>
