// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import RichText from './RichText'
import { mountComponent, unmountAll } from '../testing'

afterEach(unmountAll)

const render = (source: string) => mountComponent(RichText, { source })

describe('RichText', () => {
  it('renders bold, italic and lists as real elements', () => {
    const root = render('a **big** and *small* wish\n- a book\n- a scarf\n1. one')

    expect(root.querySelector('strong')?.textContent).toBe('big')
    expect(root.querySelector('em')?.textContent).toBe('small')
    expect([...root.querySelectorAll('ul > li')].map((item) => item.textContent)).toEqual(['a book', 'a scarf'])
    expect(root.querySelectorAll('ol > li')).toHaveLength(1)
  })

  it('opens links in a new tab without giving the page access to the opener', () => {
    const root = render('[the shop](https://example.com/x) and https://example.org/y.')

    const links = [...root.querySelectorAll('a')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/x', 'https://example.org/y'])
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    }
    expect(root.textContent).toContain('and https://example.org/y.')
  })

  it('never creates links for unsafe addresses', () => {
    const root = render('[a](javascript:alert(1)) [b](data:text/html,x) [c](https://user:pw@example.com)')

    expect(root.querySelector('a')).toBeNull()
    expect(root.textContent).toContain('javascript:alert(1)')
  })

  it('shows HTML typed by people as text, never as elements', () => {
    const root = render('<img src=x onerror=alert(1)> <b>x</b><script>alert(1)</script>')

    expect(root.querySelector('img, b, script')).toBeNull()
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('shows nothing for empty text', () => {
    expect(render('').querySelector('.rich')?.children).toHaveLength(0)
  })
})
