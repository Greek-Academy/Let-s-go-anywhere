import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { comparisonSample } from '../spot-comparison/sample.mjs'

test('built Worker runs with real local D1 and permits searches beyond five across web and native while preserving account isolation', async () => {
  let paid = 0
  let paidGate = Promise.resolve()
  const code = 'T'.repeat(43)
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: 'tools/public-search/.worker-build/entry.js',
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      bindings: {
        FIREBASE_API_KEY: 'public-test-key',
        TESTER_CODE: code,
        OPENAI_API_KEY: 'fake-key',
        ANTHROPIC_API_KEY: 'fake-key',
        SEARCH_ENABLED: 'true',
      },
      outboundService: async (request) => {
        if (request.url.startsWith('https://identitytoolkit.googleapis.com/')) {
          const { idToken } = await request.json()
          const { sub } = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url'))
          return Response.json({ users: [{ localId: sub, emailVerified: true }] })
        }
        if (
          ![
            'https://api.openai.com/v1/responses',
            'https://api.anthropic.com/v1/messages',
          ].includes(request.url)
        )
          throw new Error('Unexpected upstream; no network is permitted in this test')
        paid++
        await paidGate
        return Response.json(
          comparisonSample(request.url.includes('openai') ? 'openai' : 'anthropic', {
            stationId: '100216',
            region: '京都府 京都駅周辺',
            theme: '自然とカフェ',
          }),
        )
      },
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    await db.exec(
      readFileSync(new URL('./migrations/0001_attempts.sql', import.meta.url), 'utf8').replaceAll(
        '\n',
        ' ',
      ),
    )
    await db.exec(
      readFileSync(new URL('./migrations/0002_repeat_search.sql', import.meta.url), 'utf8')
        .replace(/--[^\n]*/g, '')
        .replaceAll('\n', ' '),
    )
    const send = (uid, path = 'compare', origin = 'https://driveplus-fbc33.web.app') => {
      const claims = {
        sub: uid,
        aud: 'driveplus-fbc33',
        iss: 'https://securetoken.google.com/driveplus-fbc33',
        auth_time: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }
      return mf.dispatchFetch(`https://example.com/api/spot-search/${path}`, {
        method: path === 'compare' ? 'POST' : 'GET',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Authorization: `Bearer header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`,
          'X-Test-Code': code,
        },
        ...(path === 'compare'
          ? {
              body: JSON.stringify({
                stationId: '100216',
                region: '京都府 京都駅周辺',
                theme: '自然とカフェ',
              }),
            }
          : {}),
      })
    }
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        send(
          `user${i}`,
          'compare',
          i % 2 ? 'capacitor://localhost' : 'https://driveplus-fbc33.web.app',
        ),
      ),
    )
    const successes = results.flatMap((r, i) => (r.status === 200 ? [i] : []))
    assert.equal(
      successes.length,
      8,
      JSON.stringify(
        await Promise.all(
          results.map(async (r) => ({ status: r.status, body: await r.clone().text() })),
        ),
      ),
    )
    assert.equal(results.filter((r) => r.status === 429).length, 0)
    assert.equal(paid, 16)
    const owner = `user${successes[0]}`
    assert.equal((await (await send(owner, 'comparison-result')).json()).spots.length, 18)
    assert.equal(await (await send('outsider', 'comparison-result')).json(), null)
    assert.equal((await send(owner)).status, 200)
    assert.equal((await send(owner, 'compare', 'capacitor://localhost')).status, 200)
    assert.equal(paid, 20)
    assert.equal((await send(owner)).status, 200)
    // Hold the winning request upstream until the other four requests are rejected.
    // Promise.all alone does not guarantee overlap when fake providers reply instantly.
    let releasePaid
    paidGate = new Promise((resolve) => {
      releasePaid = resolve
    })
    let timer
    let completed = 0
    let markCompleted
    const fourResponses = new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Concurrent requests did not reject while the winner was pending')),
        10_000,
      )
      markCompleted = () => {
        if (++completed === 4) resolve()
      }
    })
    const pending = Array.from({ length: 5 }, () =>
      send(owner).then((response) => {
        markCompleted()
        return response
      }),
    )
    try {
      await fourResponses
    } finally {
      clearTimeout(timer)
      releasePaid()
    }
    const fifth = await Promise.all(pending)
    assert.equal(paid, 24)
    assert.equal(fifth.filter((r) => r.status === 200).length, 1)
    assert.equal(fifth.filter((r) => r.status === 409).length, 4)
    assert.equal((await send(owner, 'compare', 'capacitor://localhost')).status, 200)
    const status = await (await send(owner, 'comparison-status')).json()
    assert.equal(status.attemptCount, 6)
    assert.equal(status.maxAttempts, null)
    assert.equal(paid, 26)
    assert.equal((await (await send(owner, 'comparison-result')).json()).spots.length, 18)
  } finally {
    await mf.dispose()
  }
})
