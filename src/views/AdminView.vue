<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CopyField from '../components/CopyField.vue'
import ParticipantForm from '../components/ParticipantForm.vue'
import ParticipantList from '../components/ParticipantList.vue'
import { currentBase, joinLink } from '../lib/links'
import { findAdminToken, forgetSession, rememberSession } from '../lib/localSessions'
import { SessionApiError, toFormErrors, type AdminView } from '../lib/sessionApi'
import { sessionApiKey } from '../lib/sessionApiKey'
import { MIN_PARTICIPANTS, UNEXPECTED_FORM_ERROR, type FormErrors } from '../lib/validation'
import type { ParticipantInput } from '../types'

const POLL_MS = 10_000

const api = inject(sessionApiKey, null)
const route = useRoute()
const router = useRouter()

const id = computed(() => {
  const value = route.params.id
  return Array.isArray(value) ? (value[0] ?? '') : value
})
const token = computed(() => route.hash.slice(1) || findAdminToken(id.value) || '')

const view = ref<AdminView | null>(null)
const problem = ref<'not_found' | 'unavailable' | null>(null)
const busy = ref(false)
const actionError = ref('')
const confirmingDelete = ref(false)

let latestRequest = 0

const state = computed(() => {
  if (!api) return 'unconfigured'
  if (!token.value) return 'no_token'
  if (problem.value) return problem.value
  return view.value ? 'ready' : 'loading'
})

async function fetchView() {
  if (!api || !token.value) return
  const request = ++latestRequest
  try {
    const result = await api.getAdminView(id.value, token.value)
    if (request !== latestRequest) return
    view.value = result
    problem.value = null
    rememberSession({
      id: id.value,
      title: result.session.title,
      adminToken: token.value,
      createdAt: result.session.createdAt,
    })
  } catch (error) {
    if (request !== latestRequest) return
    if (error instanceof SessionApiError && error.code === 'not_found') {
      view.value = null
      problem.value = 'not_found'
    } else if (!view.value) {
      problem.value = 'unavailable'
    }
  }
}

function reload() {
  latestRequest++
  view.value = null
  problem.value = null
  actionError.value = ''
  confirmingDelete.value = false
  return fetchView()
}

watch([id, token], reload, { immediate: true })

const refreshQuietly = () => {
  if (!busy.value && state.value === 'ready') void fetchView()
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(refreshQuietly, POLL_MS)
  window.addEventListener('focus', refreshQuietly)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', refreshQuietly)
})

async function run(action: () => Promise<void>) {
  if (!api || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await action()
  } catch (error) {
    actionError.value = error instanceof SessionApiError ? error.message : UNEXPECTED_FORM_ERROR
  }
  await fetchView()
  busy.value = false
}

async function addParticipant(input: ParticipantInput): Promise<FormErrors> {
  if (!api) return { form: UNEXPECTED_FORM_ERROR }
  try {
    await api.addParticipant(id.value, token.value, input)
  } catch (error) {
    await fetchView()
    return toFormErrors(error)
  }
  await fetchView()
  return {}
}

const removeParticipant = (participantId: number) =>
  run(() => api!.removeParticipant(id.value, token.value, participantId))
const close = () => run(() => api!.closeSession(id.value, token.value))
const reopen = () => run(() => api!.reopenSession(id.value, token.value))

async function deleteSession() {
  if (!api || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await api.deleteSession(id.value, token.value)
    forgetSession(id.value)
    await router.push('/')
  } catch (error) {
    actionError.value = error instanceof SessionApiError ? error.message : UNEXPECTED_FORM_ERROR
    confirmingDelete.value = false
    await fetchView()
  }
  busy.value = false
}

const enoughParticipants = computed(() => (view.value?.participants.length ?? 0) >= MIN_PARTICIPANTS)
const canReopen = computed(() => view.value?.session.status === 'closed' && !view.value.session.drawStartedAt)
</script>

<template>
  <section v-if="state === 'unconfigured'" class="card" aria-labelledby="admin-title">
    <h2 id="admin-title">Sessions are not available</h2>
    <p>This site is not connected to a session service yet.</p>
    <p><RouterLink to="/quick">Use the quick draw instead</RouterLink></p>
  </section>

  <section v-else-if="state === 'no_token'" class="card" aria-labelledby="admin-title">
    <h2 id="admin-title">Admin link incomplete</h2>
    <p>
      Open the full admin link you saved when you created the session. It ends with a <code>#</code> followed by a long
      code.
    </p>
    <p><RouterLink to="/">Back to start</RouterLink></p>
  </section>

  <p v-else-if="state === 'loading'" class="banner banner--info" role="status">Loading the session...</p>

  <section v-else-if="state === 'not_found'" class="card" aria-labelledby="admin-title">
    <h2 id="admin-title">Session not found</h2>
    <p>The session was deleted or expired, or the admin link is wrong.</p>
    <p><RouterLink to="/">Back to start</RouterLink></p>
  </section>

  <section v-else-if="state === 'unavailable'" class="card" aria-labelledby="admin-title">
    <h2 id="admin-title">Could not load this session</h2>
    <p>Check your internet connection and try again.</p>
    <button type="button" class="btn btn--secondary" @click="reload">Try again</button>
  </section>

  <template v-else-if="view">
    <section class="card" aria-labelledby="admin-title">
      <h2 id="admin-title">{{ view.session.title }}</h2>
      <p v-if="view.session.description">{{ view.session.description }}</p>

      <template v-if="view.session.status === 'open'">
        <p class="banner banner--info" role="status">Open: people with the link can join.</p>
        <CopyField label="Link for participants" :value="joinLink(currentBase(), view.session.id)" />
      </template>
      <p v-else-if="view.session.status === 'closed'" class="banner banner--warning" role="status">
        Closed: nobody can join anymore.
      </p>
      <p v-else class="banner banner--info" role="status">Completed.</p>
    </section>

    <section class="card" aria-labelledby="admin-participants-title">
      <h2 id="admin-participants-title">Participants <span class="count">{{ view.participants.length }}</span></h2>
      <ParticipantForm
        v-if="view.session.status === 'open'"
        :participants="view.participants"
        :save="addParticipant"
      />
      <ParticipantList
        :participants="view.participants"
        :removable="view.session.status === 'open'"
        @remove="removeParticipant"
      />
    </section>

    <section class="card" aria-labelledby="admin-manage-title">
      <h2 id="admin-manage-title">Manage</h2>
      <p v-if="view.session.status === 'open'" class="muted">
        Close the session when everyone has joined. Nobody can join after that, so the list stays fixed for the draw.
      </p>
      <p v-else-if="view.session.status === 'closed' && !canReopen" class="muted">
        The draw has started, so this session can't be reopened.
      </p>

      <p v-if="actionError" class="form__error" role="alert">{{ actionError }}</p>

      <div class="actions">
        <button
          v-if="view.session.status === 'open'"
          type="button"
          class="btn btn--primary"
          :disabled="busy || !enoughParticipants"
          @click="close"
        >
          Close session
        </button>
        <button v-else-if="canReopen" type="button" class="btn btn--secondary" :disabled="busy" @click="reopen">
          Reopen session
        </button>
        <button
          v-if="!confirmingDelete"
          type="button"
          class="btn btn--ghost"
          :disabled="busy"
          @click="confirmingDelete = true"
        >
          Delete session
        </button>
      </div>
      <p v-if="view.session.status === 'open' && !enoughParticipants" class="muted">
        Add at least {{ MIN_PARTICIPANTS }} participants to close the session.
      </p>

      <div v-if="confirmingDelete" class="banner banner--warning" role="alert">
        <p>This permanently deletes the session and everyone's details.</p>
        <div class="actions">
          <button type="button" class="btn btn--danger" :disabled="busy" @click="deleteSession">Yes, delete</button>
          <button type="button" class="btn btn--secondary" :disabled="busy" @click="confirmingDelete = false">
            Cancel
          </button>
        </div>
      </div>
    </section>
  </template>
</template>
