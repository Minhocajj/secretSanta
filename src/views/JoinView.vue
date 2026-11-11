<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ParticipantForm from '../components/ParticipantForm.vue'
import { SessionApiError, toFormErrors, type PublicSession } from '../lib/sessionApi'
import { sessionApiKey } from '../lib/sessionApiKey'
import type { FormErrors } from '../lib/validation'
import type { ParticipantInput } from '../types'

const api = inject(sessionApiKey, null)
const route = useRoute()

const id = computed(() => {
  const value = route.params.id
  return Array.isArray(value) ? (value[0] ?? '') : value
})

const session = ref<PublicSession | null>(null)
const loading = ref(false)
const problem = ref<'not_found' | 'unavailable' | null>(null)
const joined = ref(false)

let latestRequest = 0

async function load() {
  const request = ++latestRequest
  session.value = null
  problem.value = null
  joined.value = false
  if (!api) return

  loading.value = true
  try {
    const found = await api.getPublicSession(id.value)
    if (request === latestRequest) session.value = found
  } catch (error) {
    if (request === latestRequest) {
      problem.value = error instanceof SessionApiError && error.code === 'not_found' ? 'not_found' : 'unavailable'
    }
  } finally {
    if (request === latestRequest) loading.value = false
  }
}

watch(id, load, { immediate: true })

const state = computed(() => {
  if (!api) return 'unconfigured'
  if (loading.value) return 'loading'
  if (problem.value) return problem.value
  if (!session.value) return 'loading'
  if (joined.value) return 'joined'
  if (session.value.status !== 'open') return 'closed'
  if (session.value.full) return 'full'
  return 'open'
})

async function save(input: ParticipantInput): Promise<FormErrors> {
  if (!api) return toFormErrors(null)
  try {
    await api.join(id.value, input)
    joined.value = true
    return {}
  } catch (error) {
    if (error instanceof SessionApiError && session.value) {
      if (error.code === 'closed') {
        session.value = { ...session.value, status: 'closed' }
        return {}
      }
      if (error.code === 'full') {
        session.value = { ...session.value, full: true }
        return {}
      }
      if (error.code === 'not_found') {
        problem.value = 'not_found'
        return {}
      }
    }
    return toFormErrors(error)
  }
}
</script>

<template>
  <section class="card" aria-labelledby="join-title">
    <template v-if="state === 'unconfigured'">
      <h2 id="join-title">Sessions are not available</h2>
      <p>This site is not connected to a session service yet.</p>
      <p><RouterLink to="/quick">Use the quick draw instead</RouterLink></p>
    </template>

    <p v-else-if="state === 'loading'" role="status" class="muted">Loading the session...</p>

    <template v-else-if="state === 'not_found'">
      <h2 id="join-title">Session not found</h2>
      <p>This session does not exist anymore or the link is wrong. Ask the organiser for a new link.</p>
    </template>

    <template v-else-if="state === 'unavailable'">
      <h2 id="join-title">Could not load this session</h2>
      <p>Check your internet connection and try again.</p>
      <button type="button" class="btn btn--secondary" @click="load">Try again</button>
    </template>

    <template v-else-if="session">
      <h2 id="join-title">{{ session.title }}</h2>
      <p v-if="session.description">{{ session.description }}</p>

      <template v-if="state === 'open'">
        <ParticipantForm :save="save" submit-label="Join" />
        <p class="muted">
          The organiser sees your name, email and gift idea to run the draw. They are deleted automatically after
          60 days.
        </p>
      </template>

      <p v-else-if="state === 'joined'" class="banner banner--info" role="status">
        You are on the list. The organiser will run the draw and you will get an email with your match.
      </p>

      <p v-else-if="state === 'full'" class="banner banner--warning" role="status">
        This session is full: no more participants can join.
      </p>

      <p v-else class="banner banner--warning" role="status">
        This session is closed: the organiser is not taking new participants anymore.
      </p>
    </template>
  </section>
</template>
