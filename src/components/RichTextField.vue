<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'
import { insertLink, toggleBold, toggleItalic, toggleList, type Edit } from '../lib/richTextEdit'
import RichText from './RichText'

const props = withDefaults(
  defineProps<{
    modelValue: string
    id: string
    maxlength: number
    placeholder?: string
    invalid?: boolean
    describedby?: string
    rows?: number
  }>(),
  { placeholder: '', invalid: false, describedby: undefined, rows: 4 },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

type Action = 'bold' | 'italic' | 'bullets' | 'numbers' | 'link'

const area = useTemplateRef<HTMLTextAreaElement>('area')

const ACTIONS: Record<Action, (value: string, start: number, end: number) => Edit> = {
  bold: toggleBold,
  italic: toggleItalic,
  bullets: (value, start, end) => toggleList(value, start, end, false),
  numbers: (value, start, end) => toggleList(value, start, end, true),
  link: insertLink,
}

const SHORTCUTS: Record<string, Action> = { b: 'bold', i: 'italic', k: 'link' }

async function apply(action: Action) {
  const element = area.value
  if (!element) return
  const edit = ACTIONS[action](element.value, element.selectionStart, element.selectionEnd)
  emit('update:modelValue', edit.value)
  await nextTick()
  element.focus()
  element.setSelectionRange(edit.start, edit.end)
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  const action = SHORTCUTS[event.key.toLowerCase()]
  if (!action) return
  event.preventDefault()
  void apply(action)
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="editor">
    <div class="editor__toolbar" role="toolbar" aria-label="Text formatting">
      <button type="button" class="editor__button" title="Bold (Ctrl+B)" aria-label="Bold" @click="apply('bold')">
        <strong>B</strong>
      </button>
      <button type="button" class="editor__button" title="Italic (Ctrl+I)" aria-label="Italic" @click="apply('italic')">
        <em>I</em>
      </button>
      <button type="button" class="editor__button" title="Bulleted list" aria-label="Bulleted list" @click="apply('bullets')">
        &bull; List
      </button>
      <button type="button" class="editor__button" title="Numbered list" aria-label="Numbered list" @click="apply('numbers')">
        1. List
      </button>
      <button type="button" class="editor__button" title="Link (Ctrl+K)" aria-label="Link" @click="apply('link')">
        Link
      </button>
    </div>

    <textarea
      :id="id"
      ref="area"
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :aria-invalid="invalid"
      :aria-describedby="describedby"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
    />

    <p class="field__hint">
      **bold**, *italic*, lines starting with "- " or "1. " make lists, [text](https://link) makes a link.
      {{ props.modelValue.length }} / {{ maxlength }}
    </p>

    <div v-if="modelValue.trim()" class="editor__preview">
      <span class="editor__preview-label">Preview</span>
      <RichText :source="modelValue" />
    </div>
  </div>
</template>
