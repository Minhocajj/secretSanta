export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }

export interface ListBlock {
  type: 'list'
  ordered: boolean
  items: Inline[][]
}

export type Block = { type: 'paragraph'; children: Inline[] } | ListBlock

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const MARKDOWN_LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/
const BARE_URL = /^https?:\/\/[^\s<>]+/i
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/
const BULLET = /^- +(.*)$/
const NUMBERED = /^\d{1,3}[.)] +(.*)$/

export function safeUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol) || url.username || url.password) return null
  return url.href
}

function parseInline(text: string, insideLink = false): Inline[] {
  const nodes: Inline[] = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (buffer) nodes.push({ type: 'text', text: buffer })
    buffer = ''
  }

  while (index < text.length) {
    const rest = text.slice(index)

    if (!insideLink) {
      const link = MARKDOWN_LINK.exec(rest)
      const href = link ? safeUrl(link[2]) : null
      if (link && href) {
        flush()
        nodes.push({ type: 'link', href, children: parseInline(link[1], true) })
        index += link[0].length
        continue
      }

      const bare = BARE_URL.exec(rest)
      if (bare) {
        const shown = bare[0].replace(TRAILING_PUNCTUATION, '')
        const bareHref = safeUrl(shown)
        if (bareHref) {
          flush()
          nodes.push({ type: 'link', href: bareHref, children: [{ type: 'text', text: shown }] })
          index += shown.length
          continue
        }
      }
    }

    if (rest.startsWith('**')) {
      let end = rest.indexOf('**', 2)
      while (end > 2 && rest[end + 2] === '*') end++
      if (end > 2) {
        flush()
        nodes.push({ type: 'bold', children: parseInline(rest.slice(2, end), insideLink) })
        index += end + 2
        continue
      }
    }

    if (rest[0] === '*' && rest[1] !== undefined && rest[1] !== ' ' && rest[1] !== '*') {
      const end = rest.indexOf('*', 1)
      if (end > 1 && rest[end - 1] !== ' ') {
        flush()
        nodes.push({ type: 'italic', children: parseInline(rest.slice(1, end), insideLink) })
        index += end + 1
        continue
      }
    }

    buffer += text[index]
    index++
  }

  flush()
  return nodes
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: ListBlock | null = null

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const item = bullet ?? numbered

    if (item) {
      flushParagraph()
      const ordered = numbered !== null
      if (!list || list.ordered !== ordered) {
        list = { type: 'list', ordered, items: [] }
        blocks.push(list)
      }
      list.items.push(parseInline(item[1]))
      continue
    }

    list = null
    if (line.trim() === '') flushParagraph()
    else paragraph.push(line)
  }

  flushParagraph()
  return blocks
}

function plainInline(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text
      const label = plainInline(node.children)
      if (node.type !== 'link') return label
      return safeUrl(label) === node.href ? label : `${label} (${node.href})`
    })
    .join('')
}

export function toPlainText(source: string): string {
  return parseRichText(source)
    .map((block) =>
      block.type === 'paragraph'
        ? plainInline(block.children)
        : block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${plainInline(item)}`).join('\n'),
    )
    .join('\n')
}

export const hasList = (source: string) => parseRichText(source).some((block) => block.type === 'list')
