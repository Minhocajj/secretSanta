<script setup lang="ts">
import { ref, useId, useTemplateRef } from 'vue'

const props = defineProps<{ label: string; value: string }>()

const id = useId()
const state = ref<'idle' | 'copied' | 'failed'>('idle')
const input = useTemplateRef<HTMLInputElement>('input')

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    state.value = 'copied'
  } catch {
    input.value?.select()
    state.value = 'failed'
  }
}
</script>

<template>
  <div class="field field--wide">
    <label :for="id">{{ label }}</label>
    <div class="copy">
      <input :id="id" ref="input" :value="value" type="text" readonly @focus="input?.select()" />
      <button type="button" class="btn btn--secondary" @click="copy">
        {{ state === 'copied' ? 'Copied' : 'Copy' }}
      </button>
    </div>
    <p v-if="state === 'failed'" class="muted" role="status">Could not copy automatically. The link is selected: copy it by hand.</p>
  </div>
</template>
