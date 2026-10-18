import type { Plugin } from 'vite'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { randomBytes } from 'node:crypto'
import { createPhotoPilot, PhotoPilotError } from '../tools/place-photos/core.ts'

/** A loopback-only pilot: never installed in a preview server, Worker, or build. */
export function placePhotos(): Plugin {
  const token = randomBytes(32).toString('hex')
  const environmentPath = resolve('.env.photos.local')
  const root = (() => {
    try {
      return dirname(realpathSync(environmentPath))
    } catch {
      return process.cwd()
    }
  })()
  const pilot = createPhotoPilot({
    directory: resolve(root, '.local-research/place-photos-v1'),
    getKey: () => {
      try {
        return parseEnv(readFileSync(environmentPath, 'utf8')).GOOGLE_PLACES_API_KEY?.trim() ?? ''
      } catch {
        return ''
      }
    },
  })
  return {
    name: 'driveplus-place-photos-local-only',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/place-photos/')) return next()
        const send = (status: number, body: unknown) => {
          res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
          })
          res.end(JSON.stringify(body))
        }
        void (async () => {
          const host = req.headers.host ?? ''
          if (
            !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
            (req.headers.origin && req.headers.origin !== `http://${host}`)
          )
            return send(403, { error: 'Macのlocalhostから確認してください。' })
          if (req.url === '/api/place-photos/status' && req.method === 'GET')
            return send(200, { ...(await pilot.status()), token })
          if (req.url !== '/api/place-photos/lookup')
            return send(404, { error: '見つかりません。' })
          if (req.method !== 'POST') return send(405, { error: '取得ボタンから操作してください。' })
          if (
            req.headers.origin !== `http://${host}` ||
            req.headers['x-photo-token'] !== token ||
            req.headers['content-type'] !== 'application/json'
          )
            return send(403, { error: 'この検証画面から操作してください。' })
          const chunks: Buffer[] = []
          let size = 0
          for await (const part of req) {
            size += part.length
            if (size > 1024) return send(413, { error: '入力が大きすぎます。' })
            chunks.push(part)
          }
          let data: { id?: unknown }
          try {
            data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            return send(400, { error: '入力形式を確認してください。' })
          }
          if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            Object.keys(data).some((k) => k !== 'id')
          )
            return send(400, { error: '店舗IDだけを指定してください。' })
          send(200, await pilot.lookup(data.id))
        })().catch((e) =>
          send(e instanceof PhotoPilotError ? e.status : 503, {
            error:
              e instanceof PhotoPilotError
                ? e.message
                : '検証の状態を確認できないため、取得を止めました。',
          }),
        )
      })
    },
  }
}
