import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { comparisonSample } from '../spot-comparison/sample.mjs'

test('built Worker runs with real local D1 and never exceeds three slots across concurrent requests', async () => {
  let paid = 0
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
        return Response.json(
          comparisonSample(request.url.includes('openai') ? 'openai' : 'anthropic', {
            region: '京都府',
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
          ? { body: JSON.stringify({ region: '京都府', theme: '自然とカフェ' }) }
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
      3,
      JSON.stringify(
        await Promise.all(
          results.map(async (r) => ({ status: r.status, body: await r.clone().text() })),
        ),
      ),
    )
    assert.equal(results.filter((r) => r.status === 429).length, 5)
    assert.equal(paid, 6)
    const owner = `user${successes[0]}`
    assert.equal((await (await send(owner, 'comparison-result')).json()).spots.length, 18)
    assert.equal(await (await send('outsider', 'comparison-result')).json(), null)
    assert.equal((await send(owner)).status, 429)
    assert.equal((await send(owner, 'compare', 'capacitor://localhost')).status, 429)
    assert.equal(paid, 6)
  } finally {
    await mf.dispose()
  }
})
