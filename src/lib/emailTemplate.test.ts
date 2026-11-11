import { describe, expect, it } from 'vitest'
import template from '../../email-template.html?raw'

describe('email-template.html', () => {
  it('only uses the variables the app sends, with escaped double braces', () => {
    const variables = [...template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1])

    expect(new Set(variables)).toEqual(new Set(['to_name', 'message']))
    expect(template).not.toContain('{{{')
  })

  it('keeps the line breaks of the message', () => {
    expect(template).toMatch(/white-space:\s*pre-line;">\{\{message\}\}</)
  })

  it('has no animations, scripts or remote content', () => {
    expect(template).not.toMatch(/@keyframes|animation|transition|<script|<link|<img|@import|url\(|https?:\/\//i)
  })

  it('styles everything inline, since email clients drop style sheets', () => {
    expect(template).not.toContain('<style')
  })
})
