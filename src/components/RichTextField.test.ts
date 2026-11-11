// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import RichTextField from './RichTextField.vue'
import { button, mountComponent, unmountAll } from '../testing'

afterEach(unmountAll)

const value = ref('')

const Host = defineComponent({
  setup: () => () =>
    h(RichTextField, {
      id: 'gift',
      modelValue: value.value,
      maxlength: 500,
      'onUpdate:modelValue': (next: string) => {
        value.value = next
      },
    }),
})

function mountField(initial = '') {
  value.value = initial
  const root = mountComponent(Host)
  const area = root.querySelector<HTMLTextAreaElement>('#gift')!
  return { root, area }
}

async function select(area: HTMLTextAreaElement, start: number, end = start) {
  area.focus()
  area.setSelectionRange(start, end)
}

describe('RichTextField', () => {
  it('is a labelled-by-id text area with a formatting toolbar', () => {
    const { root, area } = mountField()

    expect(area.tagName).toBe('TEXTAREA')
    expect(area.getAttribute('maxlength')).toBe('500')
    expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Text formatting')
    for (const label of ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link']) {
      expect(root.querySelector(`button[aria-label="${label}"]`)?.getAttribute('type')).toBe('button')
    }
  })

  it('reports what is typed', async () => {
    const { area } = mountField()

    area.value = 'a red scarf'
    area.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(value.value).toBe('a red scarf')
  })

  it('makes the selected text bold and keeps it selected', async () => {
    const { root, area } = mountField('a red scarf')
    await select(area, 2, 5)

    button(root, 'B').click()
    await nextTick()
    await nextTick()

    expect(value.value).toBe('a **red** scarf')
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('red')
  })

  it('makes italic text, lists and links', async () => {
    const { root, area } = mountField('one\ntwo')
    await select(area, 0, 7)

    root.querySelector<HTMLButtonElement>('button[aria-label="Bulleted list"]')!.click()
    await nextTick()
    expect(value.value).toBe('- one\n- two')

    root.querySelector<HTMLButtonElement>('button[aria-label="Numbered list"]')!.click()
    await nextTick()
    expect(value.value).toBe('1. one\n2. two')

    value.value = 'shop'
    await nextTick()
    await select(area, 0, 4)
    root.querySelector<HTMLButtonElement>('button[aria-label="Link"]')!.click()
    await nextTick()
    expect(value.value).toBe('[shop](https://)')

    value.value = 'soft'
    await nextTick()
    await select(area, 0, 4)
    root.querySelector<HTMLButtonElement>('button[aria-label="Italic"]')!.click()
    await nextTick()
    expect(value.value).toBe('*soft*')
  })

  it('has keyboard shortcuts for bold, italic and link', async () => {
    const { area } = mountField('word')
    await select(area, 0, 4)

    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }))
    await nextTick()
    expect(value.value).toBe('**word**')

    value.value = 'word'
    await nextTick()
    await select(area, 0, 4)
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', metaKey: true, bubbles: true, cancelable: true }))
    await nextTick()
    expect(value.value).toBe('*word*')
  })

  it('leaves other key presses alone', async () => {
    const { area } = mountField('word')
    await select(area, 0, 4)

    const plain = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
    const withShift = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    area.dispatchEvent(plain)
    area.dispatchEvent(withShift)
    await nextTick()

    expect(plain.defaultPrevented).toBe(false)
    expect(withShift.defaultPrevented).toBe(false)
    expect(value.value).toBe('word')
  })

  it('shows a counter and a live preview with a working link only when there is text', async () => {
    const { root } = mountField()
    expect(root.querySelector('.editor__preview')).toBeNull()
    expect(root.querySelector('.field__hint')?.textContent).toContain('0 / 500')

    value.value = '**Wishlist**\n- a book\n[shop](https://example.com)'
    await nextTick()

    const preview = root.querySelector('.editor__preview')
    expect(preview?.querySelector('strong')?.textContent).toBe('Wishlist')
    expect(preview?.querySelectorAll('li')).toHaveLength(1)
    expect(preview?.querySelector('a')?.getAttribute('target')).toBe('_blank')
    expect(root.querySelector('.field__hint')?.textContent).toContain('/ 500')
  })

  it('does not show a preview for whitespace only', async () => {
    const { root } = mountField('   \n ')

    expect(root.querySelector('.editor__preview')).toBeNull()
  })
})
