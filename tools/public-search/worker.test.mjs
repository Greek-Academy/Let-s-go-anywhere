import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createPublicSearch } from './worker.mjs'
import { comparisonSample } from '../spot-comparison/sample.mjs'

const code = 'T'.repeat(43)
const query = { region: '京都府', theme: '自然とカフェ' }
const origin = 'https://driveplus-fbc33.web.app'
const sql = readFileSync(new URL('./migrations/0001_attempts.sql', import.meta.url), 'utf8')
const clock = Date.now()
function token(uid, changes = {}, time = clock) {
  return `header.${Buffer.from(
    JSON.stringify({
      sub: uid,
      aud: 'driveplus-fbc33',
      iss: 'https://securetoken.google.com/driveplus-fbc33',
      exp: Math.floor(time / 1000) + 3600,
      auth_time: Math.floor(time / 1000),
      ...changes,
    }),
  ).toString('base64url')}.signature`
}
function fixture(options = {}) {
  const database = new DatabaseSync(':memory:')
  database.exec(sql)
  const db = {
    prepare(sql) {
      let values = []
      return {
        bind(...v) {
          values = v
          return this
        },
        async first() {
          return database.prepare(sql).get(...values) ?? null
        },
        async run() {
          return database.prepare(sql).run(...values)
        },
      }
    },
  }
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    if (url.startsWith('https://identitytoolkit.googleapis.com/')) {
      if (options.authFailure) return Response.json({ error: 'invalid' }, { status: 400 })
      const claims = JSON.parse(
        Buffer.from(JSON.parse(init.body).idToken.split('.')[1], 'base64url'),
      )
      return Response.json({
        users: [{ localId: claims.sub, emailVerified: true, ...options.account }],
      })
    }
    await options.wait?.()
    const provider = url.includes('openai') ? 'openai' : 'anthropic'
    if (options.fail === provider || options.fail === 'both')
      return Response.json({ error: 'secret-provider-body' }, { status: 500 })
    if (options.large) return new Response('x'.repeat(1_048_577))
    return Response.json(comparisonSample(provider, query))
  }
  let time = clock
  const app = createPublicSearch({ fetcher, now: () => time })
  const env = {
    DB: db,
    FIREBASE_API_KEY: 'firebase-public-test',
    TESTER_CODE: code,
    OPENAI_API_KEY: 'private-openai-test',
    ANTHROPIC_API_KEY: 'private-anthropic-test',
    SEARCH_ENABLED: 'true',
  }
  const send = (uid, path = 'compare', changes = {}) =>
    app.fetch(
      new Request(`https://worker.example/api/spot-search/${path}`, {
        method: path === 'compare' ? 'POST' : 'GET',
        headers: {
          Origin: origin,
          Authorization: `Bearer ${token(uid, changes.claims, time)}`,
          'Content-Type': 'application/json',
          'X-Test-Code': code,
          ...changes.headers,
        },
        ...(path === 'compare' ? { body: JSON.stringify(changes.query ?? query) } : {}),
        ...changes.request,
      }),
      env,
    )
  return {
    app,
    env,
    database,
    send,
    calls,
    paid: () => calls.filter((c) => !c.url.includes('identitytoolkit')),
    setTime: (t) => (time = t),
  }
}

test('authenticated comparison, private free restore, no key leakage or extra AI call', async () => {
  const f = fixture()
  const r = await f.send('owner')
  assert.equal(r.status, 200)
  const result = await r.json()
  assert.equal(result.spots.length, 18)
  assert.equal(result.mode, 'live')
  assert.equal(f.paid().length, 2)
  assert.deepEqual(await (await f.send('owner', 'comparison-result')).json(), result)
  assert.equal(await (await f.send('other', 'comparison-result')).json(), null)
  const status = await (await f.send('owner', 'comparison-status')).json()
  assert.equal(status.attempts.length, 1)
  assert.equal(status.globalRemaining, 2)
  assert.equal((await f.send('owner')).status, 429)
  assert.equal(f.paid().length, 2)
  assert(!JSON.stringify(result).includes('private-'))
  for (const { url, init } of f.paid()) {
    const body = JSON.parse(init.body)
    assert.equal(url.includes('openai') ? body.max_output_tokens : body.max_tokens, 6000)
    assert.equal(url.includes('openai') ? body.max_tool_calls : body.tools[0].max_uses, 2)
    assert(!init.body.includes('owner'))
  }
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin)
  assert.equal(r.headers.get('Cache-Control'), 'no-store')
})

test('global limit is three across 20 concurrent accounts, and one per account', async () => {
  const f = fixture({ wait: () => new Promise((r) => setTimeout(r, 5)) })
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => f.send(`user-${i}`)))
  assert.equal(responses.filter((r) => r.status === 200).length, 3)
  assert.equal(responses.filter((r) => r.status === 429).length, 17)
  assert.equal(f.paid().length, 6)
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 3)
  const g = fixture()
  const same = await Promise.all(Array.from({ length: 10 }, () => g.send('same')))
  assert.equal(same.filter((r) => r.status === 200).length, 1)
  assert.equal(g.paid().length, 2)
})

test('Firebase verification, audience, expiry, email, revocation and disabled account all fail closed', async () => {
  for (const options of [
    { authFailure: true },
    { account: { emailVerified: false } },
    { account: { disabled: true } },
    { account: { localId: 'wrong' } },
    { account: { validSince: String(Math.floor(clock / 1000) + 1) } },
  ]) {
    const f = fixture(options)
    assert.equal((await f.send('user')).status, 401)
    assert.equal(f.paid().length, 0)
  }
  for (const claims of [{ aud: 'other-project' }, { iss: 'wrong' }, { exp: 1 }, { sub: '' }]) {
    const f = fixture()
    assert.equal((await f.send('user', 'compare', { claims })).status, 401)
    assert.equal(f.calls.length, 0)
  }
})

test('invitation, origin, malformed input and paused search never use AI', async () => {
  const f = fixture()
  for (const changes of [
    { headers: { 'X-Test-Code': 'wrong' } },
    { headers: { Origin: 'https://evil.example' } },
    { query: { ...query, uid: 'spoof' } },
    { query: { ...query, theme: 'x'.repeat(81) } },
    { headers: { 'Content-Type': 'text/plain' } },
    { request: { body: 'x'.repeat(2049) } },
  ]) {
    assert((await f.send('user', 'compare', changes)).status >= 400)
  }
  f.env.SEARCH_ENABLED = 'false'
  assert.equal((await f.send('user')).status, 503)
  assert.equal(f.paid().length, 0)
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 0)
})

test('provider failures consume the slot, partial success and size limits do not retry', async () => {
  for (const options of [{ fail: 'both' }, { fail: 'anthropic' }, { large: true }]) {
    const f = fixture(options)
    const result = await (await f.send('owner')).json()
    assert.equal(result.spots.length, options.fail === 'anthropic' ? 10 : 0)
    assert.equal((await f.send('owner')).status, 429)
    assert.equal(f.paid().length, 2)
    assert(!JSON.stringify(result).includes('secret-provider-body'))
    assert.equal(f.database.prepare('SELECT state FROM attempts').get().state, 'failed')
  }
})

test('seven-day expiry removes results, preserves consumed quota, stop switch allows restore', async () => {
  const f = fixture()
  await f.send('owner')
  f.env.SEARCH_ENABLED = 'false'
  assert.equal((await (await f.send('owner', 'comparison-result')).json()).spots.length, 18)
  f.setTime(clock + 7 * 86400_000)
  await f.app.scheduled({}, f.env)
  assert.equal(await (await f.send('owner', 'comparison-result')).json(), null)
  f.env.SEARCH_ENABLED = 'true'
  assert.equal((await f.send('owner')).status, 429)
  assert.equal(f.paid().length, 2)
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 1)
})

test('CORS preflight permits only expected method and headers without authentication', async () => {
  const f = fixture()
  const request = (method) =>
    new Request('https://worker.example/api/spot-search/compare', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'authorization,content-type,x-test-code',
      },
    })
  assert.equal((await f.app.fetch(request('POST'), f.env)).status, 204)
  assert.equal((await f.app.fetch(request('DELETE'), f.env)).status, 403)
  assert.equal(f.calls.length, 0)
})
