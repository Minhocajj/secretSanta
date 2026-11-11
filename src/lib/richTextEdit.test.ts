import { describe, expect, it } from 'vitest'
import { insertLink, toggleBold, toggleItalic, toggleList } from './richTextEdit'

const selected = (edit: { value: string; start: number; end: number }) => edit.value.slice(edit.start, edit.end)

describe('toggleBold', () => {
  it('wraps the selection and keeps it selected', () => {
    const edit = toggleBold('a red scarf', 2, 5)

    expect(edit.value).toBe('a **red** scarf')
    expect(selected(edit)).toBe('red')
  })

  it('unwraps a selection that is already bold', () => {
    const edit = toggleBold('a **red** scarf', 4, 7)

    expect(edit.value).toBe('a red scarf')
    expect(selected(edit)).toBe('red')
  })

  it('offers a placeholder to type over when nothing is selected', () => {
    const edit = toggleBold('', 0, 0)

    expect(edit.value).toBe('**bold text**')
    expect(selected(edit)).toBe('bold text')
  })
})

describe('toggleItalic', () => {
  it('wraps and unwraps with single stars', () => {
    const wrapped = toggleItalic('a red scarf', 2, 5)
    expect(wrapped.value).toBe('a *red* scarf')

    expect(toggleItalic(wrapped.value, wrapped.start, wrapped.end).value).toBe('a red scarf')
  })

  it('does not mistake bold stars for italic ones', () => {
    const edit = toggleItalic('a **red** scarf', 4, 7)

    expect(edit.value).toBe('a ***red*** scarf')
    expect(selected(edit)).toBe('red')
  })
})

describe('toggleList', () => {
  it('turns the lines touched by the selection into a bulleted list', () => {
    const edit = toggleList('intro\none\ntwo\nafter', 8, 12, false)

    expect(edit.value).toBe('intro\n- one\n- two\nafter')
    expect(selected(edit)).toBe('- one\n- two')
  })

  it('numbers lines for a numbered list, skipping empty ones in the count', () => {
    expect(toggleList('one\n\ntwo\nthree', 0, 14, true).value).toBe('1. one\n\n2. two\n3. three')
  })

  it('removes the bullets again when every line already has one', () => {
    expect(toggleList('- one\n- two', 0, 11, false).value).toBe('one\ntwo')
    expect(toggleList('1. one\n2. two', 0, 13, true).value).toBe('one\ntwo')
  })

  it('switches a bulleted list to a numbered one', () => {
    expect(toggleList('- one\n- two', 0, 11, true).value).toBe('1. one\n2. two')
  })

  it('starts a list on an empty line and puts the cursor after the marker', () => {
    const edit = toggleList('hello\n', 6, 6, false)

    expect(edit.value).toBe('hello\n- ')
    expect(edit.start).toBe(edit.value.length)
    expect(edit.end).toBe(edit.value.length)
  })

  it('works on the line around the cursor when nothing is selected', () => {
    expect(toggleList('one\ntwo\nthree', 5, 5, false).value).toBe('one\n- two\nthree')
  })

  it('does not swallow the next line when the selection ends right after a line break', () => {
    expect(toggleList('one\ntwo\nthree', 0, 8, false).value).toBe('- one\n- two\nthree')
  })
})

describe('insertLink', () => {
  it('wraps selected text and selects the address placeholder to type over', () => {
    const edit = insertLink('see the shop now', 4, 12)

    expect(edit.value).toBe('see [the shop](https://) now')
    expect(selected(edit)).toBe('https://')
  })

  it('uses a placeholder label when nothing is selected', () => {
    const edit = insertLink('', 0, 0)

    expect(edit.value).toBe('[link text](https://)')
    expect(selected(edit)).toBe('https://')
  })

  it('turns a selected web address into the target of a link and selects the label', () => {
    const edit = insertLink('go https://example.com/x', 3, 24)

    expect(edit.value).toBe('go [link text](https://example.com/x)')
    expect(selected(edit)).toBe('link text')
  })
})
