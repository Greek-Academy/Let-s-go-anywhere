import { PilotError } from '../spot-research/core.mjs'
import {
  MODELS,
  buildComparisonRequest,
  buildGeminiExtractionRequest,
  comparisonUsage,
  parseComparisonResponse,
  combineCandidates,
  searchProviders,
} from './core.mjs'
import { comparisonSample } from './sample.mjs'
import { addDrivingTimes } from './routes.mjs'

export async function runComparison({
  query,
  demo = false,
  apiKey,
  anthropicApiKey,
  routesApiKey,
  geminiApiKey,
  searchProvider = 'comparison',
  fetcher = fetch,
  timeoutMs = 110_000,
}) {
  const started = Date.now()
  const results = await Promise.all(
    searchProviders(searchProvider).map(async (provider) => {
      const start = Date.now()
      let usage = null
      try {
        let response, research
        if (demo) response = comparisonSample(provider, query)
        else {
          const openai = provider === 'openai'
          // One deadline covers both Gemini stages, not a new timeout per call.
          const signal = AbortSignal.timeout(query.drive ? Math.min(timeoutMs, 100_000) : timeoutMs)
          const request = async (body) => {
            const upstream = await fetcher(
              provider === 'gemini'
                ? `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`
                : openai
                  ? 'https://api.openai.com/v1/responses'
                  : 'https://api.anthropic.com/v1/messages',
              {
                method: 'POST',
                redirect: 'manual',
                signal,
                headers: {
                  'Content-Type': 'application/json',
                  ...(provider === 'gemini'
                    ? { 'x-goog-api-key': geminiApiKey }
                    : openai
                      ? { Authorization: `Bearer ${apiKey}` }
                      : { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' }),
                },
                body: JSON.stringify(body),
              },
            )
            if (!upstream.ok)
              throw new PilotError(
                'provider',
                provider === 'gemini' && upstream.status === 402
                  ? 'Geminiのクレジット残高をGoogle AI Studioで確認してください。'
                  : upstream.status === 401
                    ? 'APIキーを確認してください。'
                    : provider === 'gemini' && upstream.status === 403
                      ? 'GeminiのAPIキー・利用権限・お支払い設定をGoogle AI Studioで確認してください。'
                      : provider === 'gemini' && upstream.status === 400
                        ? 'Geminiの検索設定を確認してください。'
                        : upstream.status === 429
                          ? 'APIの残高・利用制限を確認してください。'
                          : 'APIの応答を取得できませんでした。Web検索の利用設定も確認してください。',
                502,
              )
            return upstream.json()
          }
          response = await request(buildComparisonRequest(provider, query))
          usage = comparisonUsage(provider, response)
          if (provider === 'gemini') {
            research = response
            // Fails before the second call unless the first response has actual
            // Google Search evidence. Formatting never enables search tools.
            response = await request(buildGeminiExtractionRequest(query, research))
            const extractionUsage = comparisonUsage(provider, response)
            usage =
              usage && extractionUsage
                ? {
                    ...usage,
                    inputTokens: usage.inputTokens + extractionUsage.inputTokens,
                    outputTokens: usage.outputTokens + extractionUsage.outputTokens,
                    searchCalls: usage.searchCalls + extractionUsage.searchCalls,
                  }
                : null
          }
        }
        const parsed = parseComparisonResponse(provider, response, query, research)
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
  const driving = await addDrivingTimes(combined.spots, query, {
    apiKey: routesApiKey,
    demo,
    fetcher,
  })

  return {
    ...combined,
    spots: driving.spots,
    omitted: results.reduce((sum, r) => sum + r.omitted, 0) + driving.excluded,
    reports,
    ...(results.find((r) => r.searchAttribution)?.searchAttribution
      ? { searchAttribution: results.find((r) => r.searchAttribution).searchAttribution }
      : {}),
    query,
    mode: demo ? 'sample' : 'live',
    kind: 'comparison',
    retrievedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
  }
}
