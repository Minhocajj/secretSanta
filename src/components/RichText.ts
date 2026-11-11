import { defineComponent, h, type VNodeChild } from 'vue'
import { parseRichText, type Block, type Inline } from '../lib/richText'

const renderInline = (nodes: readonly Inline[]): VNodeChild[] =>
  nodes.map((node) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'bold':
        return h('strong', renderInline(node.children))
      case 'italic':
        return h('em', renderInline(node.children))
      case 'link':
        return h('a', { href: node.href, target: '_blank', rel: 'noopener noreferrer nofollow' }, renderInline(node.children))
    }
  })

const renderBlock = (block: Block) =>
  block.type === 'paragraph'
    ? h('p', renderInline(block.children))
    : h(
        block.ordered ? 'ol' : 'ul',
        block.items.map((item) => h('li', renderInline(item))),
      )

export default defineComponent({
  name: 'RichText',
  props: { source: { type: String, required: true } },
  setup: (props) => () => h('div', { class: 'rich' }, parseRichText(props.source).map(renderBlock)),
})
