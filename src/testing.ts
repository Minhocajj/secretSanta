import { createApp, nextTick, type App, type Component, type Plugin } from 'vue'

const mounted: { app: App; root: HTMLElement }[] = []

export function mountComponent(component: Component, props: Record<string, unknown> = {}, plugins: Plugin[] = []) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(component, props)
  for (const plugin of plugins) app.use(plugin)
  app.mount(root)
  mounted.push({ app, root })
  return root
}

export function unmountAll() {
  for (const { app, root } of mounted.splice(0)) {
    app.unmount()
    root.remove()
  }
}

export const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

export function button(root: HTMLElement, label: string) {
  const found = [...root.querySelectorAll('button')].find((candidate) => clean(candidate.textContent).includes(label))
  if (!found) throw new Error(`No button labelled "${label}"`)
  return found
}

export async function typeInto(root: HTMLElement, selector: string, value: string) {
  const input = root.querySelector<HTMLInputElement>(selector)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
