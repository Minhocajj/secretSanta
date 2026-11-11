import { describe, expect, it } from 'vitest'
import { hasList, parseRichText, safeUrl, toPlainText, type Block, type Inline } from './richText'

const paragraph = (...children: Inline[]): Block => ({ type: 'paragraph', children })
const text = (value: string): Inline => ({ type: 'text', text: value })

describe('safeUrl', () => {
  it.each(['https://example.com', 'http://example.com/a?b=1#c', '  https://example.com/path  '])('accepts %s', (raw) => {
    expect(safeUrl(raw)).toMatch(/^https?:\/\//)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com',
    'mailto:a@b.co',
    '//example.com',
    'example.com',
    'https://',
    'https://user:secret@example.com',
    'https://user@example.com',
    '',
  ])('rejects %j', (raw) => {
    expect(safeUrl(raw)).toBeNull()
  })
})

describe('parseRichText', () => {
  it('reads plain text as one paragraph', () => {
    expect(parseRichText('a red scarf')).toEqual([paragraph(text('a red scarf'))])
  })

  it('returns nothing for empty input', () => {
    expect(parseRichText('')).toEqual([])
    expect(parseRichText('  \n \n')).toEqual([])
  })

  it('reads bold and italic, also inside each other', () => {
    expect(parseRichText('a **big** and *small* thing')).toEqual([
      paragraph(
        text('a '),
        { type: 'bold', children: [text('big')] },
        text(' and '),
        { type: 'italic', children: [text('small')] },
        text(' thing'),
      ),
    ])
    expect(parseRichText('**very *special***')[0]).toEqual(
      paragraph({ type: 'bold', children: [text('very '), { type: 'italic', children: [text('special')] }] }),
    )
  })

  it('leaves unmatched or spaced markers as they are', () => {
    expect(toPlainText('a ** b')).toBe('a ** b')
    expect(toPlainText('2 * 3 * 4')).toBe('2 * 3 * 4')
    expect(toPlainText('**')).toBe('**')
    expect(toPlainText('a * b')).toBe('a * b')
  })

  it('reads markdown links and links bare web addresses', () => {
    expect(parseRichText('see [the shop](https://example.com/x) now')[0]).toEqual(
      paragraph(text('see '), { type: 'link', href: 'https://example.com/x', children: [text('the shop')] }, text(' now')),
    )
    expect(parseRichText('visit https://example.com/a.')[0]).toEqual(
      paragraph(text('visit '), { type: 'link', href: 'https://example.com/a', children: [text('https://example.com/a')] }, text('.')),
    )
  })

  it('does not turn unsafe or broken links into links', () => {
    for (const source of ['[x](javascript:alert(1))', '[x](data:text/html;base64,AAAA)', '[x](not a url)', '[x](https://)']) {
      expect(JSON.stringify(parseRichText(source))).not.toContain('"link"')
    }
  })

  it('never nests links inside links', () => {
    const [block] = parseRichText('[see https://inner.example.com now](https://outer.example.com)')

    expect(block).toEqual(
      paragraph({
        type: 'link',
        href: 'https://outer.example.com/',
        children: [text('see https://inner.example.com now')],
      }),
    )
  })

  it('keeps markup that looks like HTML as plain text', () => {
    const source = '<img src=x onerror=alert(1)> <script>alert(1)</script>'

    expect(parseRichText(source)).toEqual([paragraph(text(source))])
  })

  it('reads bullet and numbered lists, and starts a new list when the kind changes', () => {
    const blocks = parseRichText('intro\n- a book\n- a scarf\n1. first\n2. second\n\nafter')

    expect(blocks).toEqual([
      paragraph(text('intro')),
      { type: 'list', ordered: false, items: [[text('a book')], [text('a scarf')]] },
      { type: 'list', ordered: true, items: [[text('first')], [text('second')]] },
      paragraph(text('after')),
    ])
  })

  it('keeps line breaks inside a paragraph and splits paragraphs at blank lines', () => {
    expect(parseRichText('one\ntwo\n\nthree')).toEqual([paragraph(text('one\ntwo')), paragraph(text('three'))])
  })

  it('formats list items too', () => {
    expect(parseRichText('- **a** [b](https://example.com)')[0]).toEqual({
      type: 'list',
      ordered: false,
      items: [[{ type: 'bold', children: [text('a')] }, text(' '), { type: 'link', href: 'https://example.com/', children: [text('b')] }]],
    })
  })

  it('does not treat a dash without a space as a list', () => {
    expect(parseRichText('-1 degree')).toEqual([paragraph(text('-1 degree'))])
  })
})

describe('toPlainText', () => {
  it('strips the markup', () => {
    expect(toPlainText('a **big** and *small* thing')).toBe('a big and small thing')
  })

  it('writes links with their address, unless the text already is the address', () => {
    expect(toPlainText('[the shop](https://example.com/x)')).toBe('the shop (https://example.com/x)')
    expect(toPlainText('go to https://example.com/x')).toBe('go to https://example.com/x')
  })

  it('writes lists with bullets and numbers', () => {
    expect(toPlainText('- a book\n- a scarf\n1. one\n2. two')).toBe('• a book\n• a scarf\n1. one\n2. two')
  })

  it('is empty for blank input', () => {
    expect(toPlainText('')).toBe('')
    expect(toPlainText('  \n')).toBe('')
  })
})

describe('hasList', () => {
  it('tells whether the text contains a list', () => {
    expect(hasList('- a')).toBe(true)
    expect(hasList('1. a')).toBe(true)
    expect(hasList('a - b')).toBe(false)
  })
})
