import { PilotError } from '../spot-research/core.mjs'
import {
  PROVIDERS,
  MODELS,
  buildComparisonRequest,
  comparisonUsage,
  parseComparisonResponse,
  combineCandidates,
} from './core.mjs'
import { comparisonSample } from './sample.mjs'

export async function runComparison({
  query,
  demo = false,
  apiKey,
  anthropicApiKey,
  fetcher = fetch,
  timeoutMs = 110_000,
}) {
  const started = Date.now()
  const results = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const start = Date.now()
      let usage = null
      try {
        let response
        if (demo) response = comparisonSample(provider, query)
        else {
          const openai = provider === 'openai'
          const upstream = await fetcher(
            openai
              ? 'https://api.openai.com/v1/responses'
              : 'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              redirect: 'manual',
              signal: AbortSignal.timeout(timeoutMs),
              headers: {
                'Content-Type': 'application/json',
                ...(openai
                  ? { Authorization: `Bearer ${apiKey}` }
                  : { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' }),
              },
              body: JSON.stringify(buildComparisonRequest(provider, query)),
            },
          )
          if (!upstream.ok)
            throw new PilotError(
              'provider',
              upstream.status === 401
                ? 'APIキーを確認してください。'
                : upstream.status === 429
                  ? 'APIの残高・利用制限を確認してください。'
                  : 'APIの応答を取得できませんでした。Web検索の利用設定も確認してください。',
              502,
            )
          response = await upstream.json()
          usage = comparisonUsage(provider, response)
        }
        const parsed = parseComparisonResponse(provider, response)
        return {
          ...parsed,
          report: {
            provider,
            model: MODELS[provider],
            state: 'completed',
            count: parsed.spots.length,
            omitted: parsed.omitted,
            elapsedMs: Date.now() - start,
            usage,
            error: null,
          },
        }
      } catch (error) {
        return {
          spots: [],
          omitted: 0,
          report: {
            provider,
            model: MODELS[provider],
            state: 'failed',
            count: 0,
            omitted: 0,
            elapsedMs: Date.now() - start,
            usage,
            error:
              error instanceof PilotError
                ? error.message
                : '通信または回答の処理に失敗しました。請求額は未確定です。',
          },
        }
      }
    }),
  )
  const reports = results.map((r) => r.report)
  const combined = combineCandidates(results)

  return {
    ...combined,
    omitted: results.reduce((sum, r) => sum + r.omitted, 0),
    reports,
    query,
    mode: demo ? 'sample' : 'live',
    kind: 'comparison',
    retrievedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
  }
}
