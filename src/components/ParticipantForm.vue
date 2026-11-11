<script setup lang="ts">
import { reactive, ref, useTemplateRef } from 'vue'
import RichTextField from './RichTextField.vue'
import { LIMITS, UNEXPECTED_FORM_ERROR, hasErrors, validateParticipant, type FormErrors } from '../lib/validation'
import type { Participant, ParticipantInput } from '../types'

const props = withDefaults(
  defineProps<{
    save: (input: ParticipantInput) => FormErrors | Promise<FormErrors>
    participants?: readonly Participant[]
    submitLabel?: string
  }>(),
  { participants: () => [], submitLabel: 'Add participant' },
)

const form = reactive<ParticipantInput>({ name: '', email: '', gift: '' })
const errors = ref<FormErrors>({})
const pending = ref(false)
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

function clearError(field: keyof ParticipantInput) {
  delete errors.value[field]
}

async function submit() {
  if (pending.value) return
  errors.value = validateParticipant(form, props.participants)
  if (hasErrors(errors.value)) return

  pending.value = true
  try {
    errors.value = await props.save({ name: form.name, email: form.email, gift: form.gift })
  } catch {
    errors.value = { form: UNEXPECTED_FORM_ERROR }
  } finally {
    pending.value = false
  }
  if (hasErrors(errors.value)) return

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
      <RichTextField
        id="participant-gift"
        v-model="form.gift"
        placeholder="Something they would love to get"
        :maxlength="LIMITS.gift"
        :invalid="Boolean(errors.gift)"
        :describedby="errors.gift ? 'participant-gift-error' : undefined"
        @update:model-value="clearError('gift')"
      />
      <p v-if="errors.gift" id="participant-gift-error" class="field__error">{{ errors.gift }}</p>
    </div>

    <p v-if="errors.form" class="form__error" role="alert">{{ errors.form }}</p>

    <button type="submit" class="btn btn--secondary" :disabled="pending">{{ submitLabel }}</button>
  </form>
</template>
