import { PilotError } from '../spot-research/core.mjs'
import {
  MODELS,
  buildComparisonRequest,
  buildGeminiExtractionRequest,
  buildGeminiEvidenceRequest,
  comparisonUsage,
  parseComparisonResponse,
  combineCandidates,
  searchProviders,
} from './core.mjs'
import { searchBrave, braveEvidence } from './brave.mjs'
import { comparisonSample } from './sample.mjs'
import { addDrivingTimes } from './routes.mjs'
import { providerCandidateLimits } from '../../src/domain/searchLimits.ts'

// Keep diagnostics useful without copying upstream messages, URLs, keys or coordinates.
function failureDetails(error, source) {
  if (error instanceof PilotError) return { error: error.message, errorCode: error.code }
  const networkCodes = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  ])
  const causes = Array.isArray(error?.cause?.errors) ? error.cause.errors : []
  const code = [error?.code, error?.cause?.code, ...causes.map((e) => e?.code)].find((value) =>
    networkCodes.has(value),
  )
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
    return {
      error: `${source}から時間内に応答が届きませんでした。時間をおいて、もう一度お試しください。`,
      errorCode: 'timeout',
    }
  if (code || (error instanceof TypeError && error.message === 'fetch failed'))
    return {
      error: `${source}に接続できませんでした。インターネット接続を確認して、もう一度お試しください。`,
      errorCode: code ?? 'network',
    }
  if (error instanceof SyntaxError)
    return {
      error: `${source}の回答を読み取れませんでした。時間をおいて、もう一度お試しください。`,
      errorCode: 'invalid_response',
    }
  return {
    error: `${source}で通信または回答の処理に失敗しました。時間をおいて、もう一度お試しください。`,
    errorCode: 'unknown',
  }
}

export async function runComparison({
  query,
  demo = false,
  apiKey,
  anthropicApiKey,
  routesApiKey,
  geminiApiKey,
  braveApiKey,
  searchProvider = 'comparison',
  fetcher = fetch,
  timeoutMs = 110_000,
}) {
  const started = Date.now()
  const results = await Promise.all(
    searchProviders(searchProvider).map(async (provider) => {
      const start = Date.now()
      let usage = null
      let braveCalls = 0
      const providerName = { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini' }[provider]
      let source = providerName
      try {
        let response, research, evidence
        if (demo) {
          response = comparisonSample(provider, query)
          if (searchProvider === 'brave') {
            const spots = JSON.parse(response.candidates[0].content.parts[0].text).spots
            evidence = braveEvidence([
              {
                grounding: {
                  generic: spots.map((s) => ({
                    url: s.sourceUrl,
                    title: s.name,
                    snippets: [s.summary],
                  })),
                },
              },
            ])
            delete response.candidates[0].groundingMetadata
            response.candidates[0].content.parts[0].text = JSON.stringify({
              spots: spots.map(({ sourceUrl, ...s }, i) => ({ ...s, sourceId: `s${i}` })),
            })
          }
        } else {
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
          if (searchProvider === 'brave') {
            source = 'Brave検索サービス'
            evidence = await searchBrave(query, {
              apiKey: braveApiKey,
              fetcher,
              signal,
              onAttempt: () => {
                braveCalls++
              },
            })
            source = providerName
            response = await request(buildGeminiEvidenceRequest(query, evidence))
          } else response = await request(buildComparisonRequest(provider, query))
          usage = comparisonUsage(provider, response)
          if (provider === 'gemini' && searchProvider !== 'brave') {
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
        const parsed = parseComparisonResponse(provider, response, query, research, evidence)
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
            ...(searchProvider === 'brave' ? { braveSearchCalls: braveCalls } : {}),
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
            ...(searchProvider === 'brave' ? { braveSearchCalls: braveCalls } : {}),
            ...failureDetails(error, source),
          },
        }
      }
    }),
  )
  const reports = results.map((r) => r.report)
  const combined = combineCandidates(results)
  const driving = await addDrivingTimes(combined.spots, query, {
    candidateLimit: searchProvider !== 'comparison' ? providerCandidateLimits.gemini : 20,
    apiKey: routesApiKey,
    demo,
    fetcher,
  })

  return {
    ...combined,
    ...(searchProvider === 'brave' ? { searchBackend: 'brave' } : {}),
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
