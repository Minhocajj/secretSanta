import { safeUrl } from './richText'

export interface Edit {
  value: string
  start: number
  end: number
}

const BOLD_PLACEHOLDER = 'bold text'
const ITALIC_PLACEHOLDER = 'italic text'
const LINK_PLACEHOLDER = 'link text'
const URL_PLACEHOLDER = 'https://'
const LIST_PREFIX = /^(- +|\d{1,3}[.)] +)/
const BULLET_PREFIX = /^- +/
const NUMBER_PREFIX = /^\d{1,3}[.)] +/

function isWrapped(before: string, after: string, marker: string): boolean {
  if (!before.endsWith(marker) || !after.startsWith(marker)) return false
  if (marker.length > 1) return true
  return !before.endsWith(marker.repeat(2)) && !after.startsWith(marker.repeat(2))
}

function toggleWrap(value: string, start: number, end: number, marker: string, placeholder: string): Edit {
  const before = value.slice(0, start)
  const selected = value.slice(start, end)
  const after = value.slice(end)

  if (selected && isWrapped(before, after, marker)) {
    return {
      value: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      start: start - marker.length,
      end: end - marker.length,
    }
  }

  const text = selected || placeholder
  return {
    value: `${before}${marker}${text}${marker}${after}`,
    start: start + marker.length,
    end: start + marker.length + text.length,
  }
}

export const toggleBold = (value: string, start: number, end: number): Edit =>
  toggleWrap(value, start, end, '**', BOLD_PLACEHOLDER)

export const toggleItalic = (value: string, start: number, end: number): Edit =>
  toggleWrap(value, start, end, '*', ITALIC_PLACEHOLDER)

export function toggleList(value: string, start: number, end: number, ordered: boolean): Edit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
  const lastSelected = end > start && value[end - 1] === '\n' ? end - 1 : end
  const newline = value.indexOf('\n', lastSelected)
  const lineEnd = newline === -1 ? value.length : newline
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const prefix = ordered ? NUMBER_PREFIX : BULLET_PREFIX

  let replaced: string
  if (lines.length === 1 && lines[0].trim() === '') {
    replaced = ordered ? '1. ' : '- '
    return { value: value.slice(0, lineStart) + replaced + value.slice(lineEnd), start: lineStart + replaced.length, end: lineStart + replaced.length }
  }

  const alreadyList = lines.some((line) => prefix.test(line)) && lines.every((line) => !line.trim() || prefix.test(line))
  let number = 0
  replaced = lines
    .map((line) => {
      if (alreadyList) return line.replace(prefix, '')
      if (!line.trim()) return line
      number++
      return `${ordered ? `${number}. ` : '- '}${line.replace(LIST_PREFIX, '')}`
    })
    .join('\n')

  return {
    value: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + replaced.length,
  }
}

export function insertLink(value: string, start: number, end: number): Edit {
  const before = value.slice(0, start)
  const selected = value.slice(start, end)
  const after = value.slice(end)

  if (safeUrl(selected)) {
    return {
      value: `${before}[${LINK_PLACEHOLDER}](${selected.trim()})${after}`,
      start: start + 1,
      end: start + 1 + LINK_PLACEHOLDER.length,
    }
  }

  const label = selected || LINK_PLACEHOLDER
  const urlStart = start + label.length + 3
  return {
    value: `${before}[${label}](${URL_PLACEHOLDER})${after}`,
    start: urlStart,
    end: urlStart + URL_PLACEHOLDER.length,
  }
}
