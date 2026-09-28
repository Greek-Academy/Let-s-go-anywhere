import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** Dev-only same-origin bridge. No API key or provider endpoint enters the browser bundle. */
export function searchBridge(port = 4181): Plugin {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid search backend port')
  const backend = `http://127.0.0.1:${port}`
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(data))
    }
    const path = req.url
    const host = req.headers.host ?? ''
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host))
      return send(403, { error: 'Web検索はMacのlocalhostから確認してください。' })
    if (path !== '/api/spot-search/status' && path !== '/api/spot-search/search')
      return send(404, { error: '見つかりません。' })
    const search = path.endsWith('/search')
    if (req.method !== (search ? 'POST' : 'GET'))
      return send(405, { error: 'この操作は利用できません。' })
    if (
      search &&
      (req.headers.origin !== `http://${host}` ||
        req.headers['content-type'] !== 'application/json')
    )
      return send(403, { error: 'このアプリの検索画面から操作してください。' })
    try {
      let body: string | undefined
      if (search) {
        const chunks: Buffer[] = []
        let size = 0
        for await (const part of req) {
          size += part.length
          if (size > 2048) return send(413, { error: '入力が長すぎます。' })
          chunks.push(part)
        }
        body = Buffer.concat(chunks).toString('utf8')
      }
      const response = await fetch(`${backend}/api/${search ? 'search' : 'status'}`, {
        method: req.method,
        headers: search
          ? {
              Origin: backend,
              'Content-Type': 'application/json',
              'X-Pilot-Token':
                typeof req.headers['x-pilot-token'] === 'string'
                  ? req.headers['x-pilot-token']
                  : '',
            }
          : {},
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(125_000),
      })
      send(response.status, await response.json())
    } catch {
      send(503, {
        error:
          '検索サーバーに接続できません。Macで npm run research を起動してください。自動では再検索しません。',
      })
    }
  }
  return {
    name: 'driveplus-local-search',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/spot-search/')) return next()
        void handle(req, res)
      })
    },
  }
}
