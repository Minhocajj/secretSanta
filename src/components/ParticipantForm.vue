<script setup lang="ts">
import { reactive, ref, useTemplateRef } from 'vue'
import { LIMITS, hasErrors, validateParticipant, type ParticipantErrors } from '../lib/validation'
import type { Participant, ParticipantInput } from '../types'

const props = defineProps<{ participants: readonly Participant[] }>()
const emit = defineEmits<{ add: [input: ParticipantInput] }>()

const form = reactive<ParticipantInput>({ name: '', email: '', gift: '' })
const errors = ref<ParticipantErrors>({})
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

function clearError(field: keyof ParticipantInput) {
  delete errors.value[field]
}

function submit() {
  errors.value = validateParticipant(form, props.participants)
  if (hasErrors(errors.value)) return
  emit('add', { name: form.name, email: form.email, gift: form.gift })
  form.name = ''
  form.email = ''
  form.gift = ''
  nameInput.value?.focus()
}
</script>

<template>
  <form class="form" novalidate @submit.prevent="submit">
    <div class="field">
      <label for="participant-name">Name</label>
      <input
        id="participant-name"
        ref="nameInput"
        v-model="form.name"
        type="text"
        autocomplete="off"
        :maxlength="LIMITS.name"
        :aria-invalid="Boolean(errors.name)"
        :aria-describedby="errors.name ? 'participant-name-error' : undefined"
        @input="clearError('name')"
      />
      <p v-if="errors.name" id="participant-name-error" class="field__error">{{ errors.name }}</p>
    </div>

    <div class="field">
      <label for="participant-email">Email</label>
      <input
        id="participant-email"
        v-model="form.email"
        type="email"
        autocomplete="off"
        :maxlength="LIMITS.email"
        :aria-invalid="Boolean(errors.email)"
        :aria-describedby="errors.email ? 'participant-email-error' : undefined"
        @input="clearError('email')"
      />
      <p v-if="errors.email" id="participant-email-error" class="field__error">{{ errors.email }}</p>
    </div>

    <div class="field field--wide">
      <label for="participant-gift">Gift idea <span class="optional">(optional)</span></label>
      <input
        id="participant-gift"
        v-model="form.gift"
        type="text"
        autocomplete="off"
        placeholder="Something they would love to get"
        :maxlength="LIMITS.gift"
        :aria-invalid="Boolean(errors.gift)"
        :aria-describedby="errors.gift ? 'participant-gift-error' : undefined"
        @input="clearError('gift')"
      />
      <p v-if="errors.gift" id="participant-gift-error" class="field__error">{{ errors.gift }}</p>
    </div>

    <button type="submit" class="btn btn--secondary">Add participant</button>
  </form>
</template>
