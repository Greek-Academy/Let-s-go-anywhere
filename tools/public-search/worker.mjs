import { PilotError } from '../spot-research/core.mjs'
import { validateComparisonQuery } from '../spot-comparison/core.mjs'
import { runComparison } from '../spot-comparison/providers.mjs'

export const GLOBAL_LIMIT = 3
const TTL = 7 * 24 * 60 * 60 * 1000
const PROJECT = 'driveplus-fbc33'
const ORIGINS = new Set([
  'https://driveplus-fbc33.web.app',
  'https://driveplus-fbc33.firebaseapp.com',
])
const PREFIX = '/api/spot-search/'
const codePattern = /^[A-Za-z0-9_-]{43}$/
const encoder = new TextEncoder()
const sha = async (value) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
async function limitedJson(response, maximum) {
  if (Number(response.headers.get('content-length') ?? 0) > maximum)
    throw new PilotError('size', '受信データが大きすぎます。', 413)
  const reader = response.body?.getReader()
  if (!reader) throw new PilotError('body', '入力を確認してください。')
  let total = 0,
    value = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maximum) throw new PilotError('size', '受信データが大きすぎます。', 413)
      value += decoder.decode(next.value, { stream: true })
    }
    return JSON.parse(value + decoder.decode())
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof PilotError) throw error
    throw new PilotError('json', '入力形式を確認してください。')
  } finally {
    reader.releaseLock()
  }
}

// The Auth REST endpoint verifies the token and account. Never trust a decoded JWT alone.
async function authenticate(request, env, fetcher, now) {
  const bearer = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [A-Za-z0-9_.-]{20,4096}$/.test(bearer))
    throw new PilotError('auth', 'ログインしてから検索してください。', 401)
  const idToken = bearer.slice(7)
  let claims
  try {
    claims = JSON.parse(atob(idToken.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
  } catch {
    throw new PilotError('auth', 'ログインし直してください。', 401)
  }
  if (
    claims.aud !== PROJECT ||
    claims.iss !== `https://securetoken.google.com/${PROJECT}` ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= now ||
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time * 1000 > now + 60_000
  )
    throw new PilotError('auth', 'ログインし直してください。', 401)
  const response = await fetcher(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok)
    throw new PilotError(
      'auth',
      'ログイン状態を確認できません。もう一度ログインしてください。',
      401,
    )
  const account = (await limitedJson(response, 65_536)).users
  if (
    !Array.isArray(account) ||
    account.length !== 1 ||
    account[0].localId !== claims.sub ||
    account[0].disabled ||
    account[0].emailVerified !== true ||
    (account[0].validSince &&
      (!Number.isFinite(Number(account[0].validSince)) ||
        claims.auth_time < Number(account[0].validSince)))
  )
    throw new PilotError('auth', 'メール確認済みのアカウントでログインしてください。', 401)
  return sha(`${PROJECT}:${claims.sub}`)
}

export function createPublicSearch({ fetcher = fetch, now = Date.now } = {}) {
  return {
    async fetch(request, env) {
      const origin = request.headers.get('Origin') ?? ''
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        Vary: 'Origin',
        ...(ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
      }
      const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers })
      try {
        const url = new URL(request.url)
        if (!ORIGINS.has(origin))
          throw new PilotError('origin', 'この公開検証画面から利用してください。', 403)
        if (
          url.search ||
          !['comparison-status', 'comparison-result', 'compare'].some(
            (p) => url.pathname === PREFIX + p,
          )
        )
          throw new PilotError('path', 'ページが見つかりません。', 404)
        const method = url.pathname.endsWith('/compare') ? 'POST' : 'GET'
        if (request.method === 'OPTIONS') {
          const asked = (request.headers.get('Access-Control-Request-Headers') ?? '')
            .toLowerCase()
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          if (
            request.headers.get('Access-Control-Request-Method') !== method ||
            asked.some((h) => !['authorization', 'content-type', 'x-test-code'].includes(h))
          )
            throw new PilotError('cors', '許可されていないリクエストです。', 403)
          return new Response(null, {
            status: 204,
            headers: {
              ...headers,
              'Access-Control-Allow-Methods': method,
              'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Test-Code',
              'Access-Control-Max-Age': '600',
            },
          })
        }
        if (request.method !== method)
          throw new PilotError('method', '許可されていない操作です。', 405)
        if (!env.DB || !env.FIREBASE_API_KEY || !codePattern.test(env.TESTER_CODE ?? ''))
          throw new PilotError('config', '公開検索の接続準備中です。', 503)
        const code = request.headers.get('X-Test-Code') ?? ''
        if (!codePattern.test(code) || (await sha(code)) !== (await sha(env.TESTER_CODE)))
          throw new PilotError('invite', '参加コードを確認してください。', 403)
        const time = now()
        const owner = await authenticate(request, env, fetcher, time)
        await env.DB.prepare(
          'UPDATE attempts SET result = NULL WHERE result IS NOT NULL AND created_at <= ?',
        )
          .bind(time - TTL)
          .run()
        const attempt = await env.DB.prepare(
          'SELECT created_at, state, result FROM attempts WHERE owner = ?',
        )
          .bind(owner)
          .first()
        if (url.pathname.endsWith('/comparison-status')) {
          const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM attempts').first()
          return json({
            kind: 'comparison',
            demo: false,
            configured: Boolean(env.OPENAI_API_KEY && env.ANTHROPIC_API_KEY),
            enabled: env.SEARCH_ENABLED === 'true',
            busy: attempt?.state === 'reserved' && time - attempt.created_at < 130_000,
            maxAttempts: 1,
            attempts: attempt ? [{ state: attempt.state }] : [],
            globalRemaining: Math.max(0, GLOBAL_LIMIT - count.count),
            hasResult: Boolean(attempt?.result),
          })
        }
        if (url.pathname.endsWith('/comparison-result'))
          return json(attempt?.result ? JSON.parse(attempt.result) : null)
        if (env.SEARCH_ENABLED !== 'true' || !env.OPENAI_API_KEY || !env.ANTHROPIC_API_KEY)
          throw new PilotError(
            'disabled',
            '新しい検索は現在停止しています。前回の結果は開けます。',
            503,
          )
        if (!request.headers.get('Content-Type')?.startsWith('application/json'))
          throw new PilotError('type', '入力形式を確認してください。', 415)
        const query = validateComparisonQuery(await limitedJson(request, 2048))
        // One SQLite statement: global check + reservation are atomic across Worker instances.
        const reserved = await env.DB.prepare(
          `INSERT INTO attempts (owner, request_id, created_at, state)
          SELECT ?, ?, ?, 'reserved' WHERE (SELECT COUNT(*) FROM attempts) < ?
          ON CONFLICT(owner) DO NOTHING RETURNING request_id`,
        )
          .bind(owner, crypto.randomUUID(), time, GLOBAL_LIMIT)
          .first()
        if (!reserved)
          throw new PilotError(
            'limit',
            '今回は1人1回・全員で3回までです。前回の比較結果は無料で開けます。',
            429,
          )
        let result
        try {
          result = await runComparison({
            query,
            apiKey: env.OPENAI_API_KEY,
            anthropicApiKey: env.ANTHROPIC_API_KEY,
            fetcher: async (...args) => {
              const response = await fetcher(...args)
              return {
                ok: response.ok,
                status: response.status,
                json: () => limitedJson(response, 1_048_576),
              }
            },
          })
        } catch {
          await env.DB.prepare("UPDATE attempts SET state = 'failed' WHERE owner = ?")
            .bind(owner)
            .run()
          throw new PilotError(
            'failed',
            '検索を完了できませんでした。回数は消費済みです。自動の再検索はしません。',
            502,
          )
        }
        const state = result.reports.every((r) => r.state === 'completed') ? 'completed' : 'failed'
        await env.DB.prepare(
          'UPDATE attempts SET state = ?, result = ? WHERE owner = ? AND request_id = ?',
        )
          .bind(state, JSON.stringify(result), owner, reserved.request_id)
          .run()
        return json(result)
      } catch (error) {
        return json(
          {
            error:
              error instanceof PilotError
                ? error.message
                : '処理を確認できませんでした。再検索せず、前回の結果を確認してください。',
          },
          error instanceof PilotError ? error.status : 503,
        )
      }
    },
    async scheduled(_event, env) {
      await env.DB.prepare(
        'UPDATE attempts SET result = NULL WHERE result IS NOT NULL AND created_at <= ?',
      )
        .bind(now() - TTL)
        .run()
    },
  }
}
export default createPublicSearch()
