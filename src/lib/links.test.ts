import { describe, expect, it } from 'vitest'
import { adminLink, joinLink, publicBase } from './links'

describe('publicBase', () => {
  it('uses the current origin by default', () => {
    expect(publicBase({}, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(publicBase({ VITE_PUBLIC_URL: '  ' }, 'http://localhost:5173/')).toBe('http://localhost:5173')
  })

  it('prefers a valid configured URL and drops trailing slashes, queries and fragments', () => {
    expect(publicBase({ VITE_PUBLIC_URL: 'https://santa.example.com/' }, 'http://localhost:5173')).toBe(
      'https://santa.example.com',
    )
    expect(publicBase({ VITE_PUBLIC_URL: 'https://example.com/santa/?x=1#y' }, 'http://localhost')).toBe(
      'https://example.com/santa',
    )
  })

  it.each(['not a url', 'javascript:alert(1)', 'ftp://example.com'])('ignores the invalid URL %j', (value) => {
    expect(publicBase({ VITE_PUBLIC_URL: value }, 'http://localhost:5173')).toBe('http://localhost:5173')
  })
})

describe('links', () => {
  it('builds the participant link without the token', () => {
    expect(joinLink('https://x.test', 'abc')).toBe('https://x.test/join/abc')
  })

  it('puts the admin token in the fragment so it is never sent to a server', () => {
    expect(adminLink('https://x.test', 'abc', 'secret')).toBe('https://x.test/admin/abc#secret')
  })
})
