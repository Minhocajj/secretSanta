<script setup lang="ts">
import { inject, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import CopyField from '../components/CopyField.vue'
import SantaPull from '../components/SantaPull.vue'
import { adminLink, currentBase, joinLink } from '../lib/links'
import { forgetSession, loadSessions, rememberSession } from '../lib/localSessions'
import { SessionApiError } from '../lib/sessionApi'
import { sessionApiKey } from '../lib/sessionApiKey'
import { SESSION_LIMITS, UNEXPECTED_FORM_ERROR, hasErrors, validateSession, type SessionErrors } from '../lib/validation'
import type { SessionInput } from '../types'

const api = inject(sessionApiKey, null)

const form = reactive<SessionInput>({ title: '', description: '' })
const errors = ref<SessionErrors & { form?: string }>({})
const pending = ref(false)
const created = ref<{ id: string; title: string; adminToken: string } | null>(null)
const sessions = ref(loadSessions())

const base = currentBase()

function clearError(field: keyof SessionInput) {
  delete errors.value[field]
}

async function create() {
  if (!api || pending.value) return
  errors.value = validateSession(form)
  if (hasErrors(errors.value)) return

  pending.value = true
  try {
    const { id, adminToken } = await api.createSession({ title: form.title, description: form.description })
    const title = form.title.replace(/\s+/gu, ' ').trim()
    rememberSession({ id, title, adminToken, createdAt: new Date().toISOString() })
    sessions.value = loadSessions()
    created.value = { id, title, adminToken }
    form.title = ''
    form.description = ''
  } catch (error) {
    if (error instanceof SessionApiError) {
      const next: SessionErrors & { form?: string } = {}
      if (error.fields.title) next.title = error.fields.title
      if (error.fields.description) next.description = error.fields.description
      errors.value = hasErrors(next) ? next : { form: error.message }
    } else {
      errors.value = { form: UNEXPECTED_FORM_ERROR }
    }
  } finally {
    pending.value = false
  }
}

function forget(id: string) {
  forgetSession(id)
  sessions.value = loadSessions()
}

const formatDate = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}
</script>

<template>
  <section v-if="!api" class="card" aria-labelledby="create-title">
    <h2 id="create-title">Create a session</h2>
    <p class="banner banner--warning" role="status">
      Sessions are not available here yet: this site is not connected to a session service.
    </p>
  </section>

  <SantaPull v-else label="Create a session">
    <section class="card" aria-labelledby="create-title">
      <h2 id="create-title">Create a session</h2>
      <p class="muted">Share one link, everyone adds their own details, then you run the draw.</p>
      <form class="form" novalidate @submit.prevent="create">
        <div class="field field--wide">
          <label for="session-title">Title</label>
          <input
            id="session-title"
            v-model="form.title"
            type="text"
            autocomplete="off"
            placeholder="Office party 2026"
            :maxlength="SESSION_LIMITS.title"
            :aria-invalid="Boolean(errors.title)"
            :aria-describedby="errors.title ? 'session-title-error' : undefined"
            @input="clearError('title')"
          />
          <p v-if="errors.title" id="session-title-error" class="field__error">{{ errors.title }}</p>
        </div>

        <div class="field field--wide">
          <label for="session-description">Note for participants <span class="optional">(optional)</span></label>
          <textarea
            id="session-description"
            v-model="form.description"
            rows="4"
            autocomplete="off"
            placeholder="Budget 20 EUR, gifts on Dec 20"
            :maxlength="SESSION_LIMITS.description"
            :aria-invalid="Boolean(errors.description)"
            :aria-describedby="errors.description ? 'session-description-error' : undefined"
            @input="clearError('description')"
          />
          <p class="field__hint">{{ form.description.length }} / {{ SESSION_LIMITS.description }}</p>
          <p v-if="errors.description" id="session-description-error" class="field__error">
            {{ errors.description }}
          </p>
        </div>

        <p v-if="errors.form" class="form__error" role="alert">{{ errors.form }}</p>

        <button type="submit" class="btn btn--primary" :disabled="pending">Create session</button>
      </form>
    </section>
  </SantaPull>

  <section v-if="created" class="card" aria-labelledby="created-title">
    <h2 id="created-title">Session created: {{ created.title }}</h2>
    <p class="banner banner--warning" role="alert">
      Save the admin link. Anyone with it can manage this session, and it can't be recovered.
    </p>
    <CopyField label="Link for participants" :value="joinLink(base, created.id)" />
    <CopyField label="Admin link (keep private)" :value="adminLink(base, created.id, created.adminToken)" />
    <p>
      <RouterLink
        class="btn btn--secondary"
        :to="{ name: 'admin', params: { id: created.id }, hash: `#${created.adminToken}` }"
      >
        Open admin page
      </RouterLink>
    </p>
  </section>

  <section v-if="sessions.length" class="card" aria-labelledby="stored-title">
    <h2 id="stored-title">Sessions on this device</h2>
    <ul class="participants">
      <li v-for="session in sessions" :key="session.id" class="participant">
        <div class="participant__info">
          <RouterLink :to="{ name: 'admin', params: { id: session.id }, hash: `#${session.adminToken}` }">
            {{ session.title }}
          </RouterLink>
          <span class="muted">{{ formatDate(session.createdAt) }}</span>
        </div>
        <button
          type="button"
          class="btn btn--ghost"
          :aria-label="`Forget ${session.title}`"
          @click="forget(session.id)"
        >
          Forget
        </button>
      </li>
    </ul>
    <p class="muted">
      Only the admin link is kept in this browser. "Forget" removes it from this device, not the session.
    </p>
  </section>

  <p class="hero-link"><RouterLink to="/quick">Just need a quick draw on this device? Use the quick draw</RouterLink></p>
</template>
