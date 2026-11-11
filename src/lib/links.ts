export function publicBase(env: Record<string, unknown>, origin: string): string {
  const configured = env.VITE_PUBLIC_URL
  if (typeof configured === 'string' && configured.trim()) {
    try {
      const url = new URL(configured.trim())
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.origin + url.pathname.replace(/\/+$/, '')
      }
    } catch {
      // fall through to the current origin
    }
  }
  return origin.replace(/\/+$/, '')
}

export const joinLink = (base: string, id: string) => `${base}/join/${encodeURIComponent(id)}`

export const adminLink = (base: string, id: string, adminToken: string) =>
  `${base}/admin/${encodeURIComponent(id)}#${adminToken}`

export const currentBase = () => publicBase(import.meta.env, location.origin)
