import { handleSend, json, type Env } from './send'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/api/send') return handleSend(request, env)
    return json(404, { error: 'not_found', message: 'Unknown endpoint' })
  },
}
