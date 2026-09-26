import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import {
  buildRequest,
  validateQuery,
  parseResponse,
  measureUsage,
  PilotError,
  MAX_ATTEMPTS,
  MODEL,
  REGION,
  DEFAULT_THEME,
  PRICING_DATE,
  SOURCE_DOMAINS,
} from './core.mjs'
import { Ledger } from './ledger.mjs'
import { sampleResponse } from './sample.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
])

export function createPilot({
  demo = false,
  apiKey = '',
  directory = resolve(root, '.local-research'),
  fetcher = fetch,
  timeoutMs = 120_000,
} = {}) {
  const token = randomBytes(32).toString('hex')
  const ledger = new Ledger(directory)
  let busy = false
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(value))
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    )
    if (req.headers.host !== new URL(origin).host)
      return send(403, { error: 'このPCの検証URLから開いてください。' })
    const path = new URL(req.url, origin).pathname
    if (req.method === 'GET' && assets.has(path)) {
      const [file, type] = assets.get(path)
      res.writeHead(200, { 'Content-Type': type })
      return res.end(readFileSync(new URL(file, import.meta.url)))
    }
    try {
      if (req.method === 'GET' && path === '/api/status') {
        return send(200, {
          demo,
          configured: demo || Boolean(apiKey),
          token,
          busy,
          region: REGION,
          theme: DEFAULT_THEME,
          model: MODEL,
          pricingDate: PRICING_DATE,
          sourceDomains: SOURCE_DOMAINS,
          maxAttempts: MAX_ATTEMPTS,
          attempts: demo ? [] : ledger.read().attempts,
        })
      }
      if (req.method !== 'POST' || path !== '/api/search')
        return send(404, { error: '見つかりません。' })
      if (
        req.headers.origin !== origin ||
        req.headers['x-pilot-token'] !== token ||
        req.headers['content-type'] !== 'application/json'
      )
        throw new PilotError('origin', '検証画面を開き直して操作してください。', 403)
      if (busy) throw new PilotError('busy', '検索中です。結果を待ってください。', 409)
      let bytes = 0
      const chunks = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 2048) throw new PilotError('size', '入力が長すぎます。', 413)
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        throw new PilotError('input', '入力を読み取れませんでした。')
      }
      const query = validateQuery(input)
      if (!demo && !apiKey)
        throw new PilotError(
          'key',
          'OpenAI APIキーを .env.research.local に設定し、サーバーを再起動してください。',
          503,
        )
      // No awaits between concurrency check and reservation.
      if (busy) throw new PilotError('busy', '検索中です。結果を待ってください。', 409)
      const attemptId = demo ? null : ledger.reserve()
      busy = true
      const started = Date.now()
      let usage = null
      let completed = false
      try {
        let response
        if (demo) response = sampleResponse()
        else {
          const upstream = await fetcher('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildRequest(query)),
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'error',
          })
          if (!upstream.ok) {
            const message =
              upstream.status === 401
                ? 'APIキーを確認してください。'
                : upstream.status === 429
                  ? 'APIの残高・利用制限を確認してください。'
                  : 'APIから結果を取得できませんでした。'
            throw new PilotError('provider', message + ' 自動では再試行しません。', 502)
          }
          response = await upstream.json()
        }
        usage = demo ? null : measureUsage(response)
        const parsed = parseResponse(response)
        if (!demo) ledger.finish(attemptId, 'completed', usage, Date.now() - started)
        completed = true
        return send(200, {
          ...parsed,
          mode: demo ? 'sample' : 'live',
          query,
          retrievedAt: new Date().toISOString(),
          elapsedMs: Date.now() - started,
          usage,
          model: MODEL,
          attemptsUsed: demo ? 0 : ledger.read().attempts.length,
          sourcesNote: demo
            ? '架空サンプルです。リンクはサイトの入口の例で、施設の根拠ではありません。'
            : '検索で参照されたURLとの一致を確認しています。内容の正しさ・地域・営業状況は人による確認前です。',
        })
      } catch (error) {
        if (!demo && !completed) ledger.finish(attemptId, 'failed', usage, Date.now() - started)
        if (error instanceof PilotError) throw error
        throw new PilotError(
          'network',
          '通信または回答の処理に失敗しました。試行回数に含め、請求額は未確定として扱います。自動では再試行しません。',
          502,
        )
      } finally {
        busy = false
      }
    } catch (error) {
      const known = error instanceof PilotError
      return send(known ? error.status : 500, {
        error: known ? error.message : '検証処理を完了できませんでした。開発側へ確認してください。',
      })
    }
  })
  server.requestTimeout = 10_000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const demo = process.argv.includes('--demo')
  const portIndex = process.argv.indexOf('--port')
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4181
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port')
  let apiKey = ''
  if (!demo) {
    try {
      apiKey =
        parseEnv(
          readFileSync(resolve(root, '.env.research.local'), 'utf8'),
        ).OPENAI_API_KEY?.trim() ?? ''
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot read local key file')
    }
  }
  createPilot({ demo, apiKey }).listen(port, '127.0.0.1', () => {
    console.log(
      `Drive+ ${demo ? '架空サンプル（通信なし）' : '実検索の検証'}: http://127.0.0.1:${port}`,
    )
    console.log('検索は画面のボタン操作時のみ。APIキーは画面・ログに表示しません。')
  })
}
