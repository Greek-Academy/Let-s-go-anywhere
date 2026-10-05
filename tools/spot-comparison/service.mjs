import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Ledger } from '../spot-research/ledger.mjs'
import { PilotError } from '../spot-research/core.mjs'
import {
  PROVIDERS,
  MODELS,
  SEARCH_LIMIT,
  COMPARISON_LIMIT,
  validateComparisonQuery,
  buildComparisonRequest,
  comparisonUsage,
  parseComparisonResponse,
  combineCandidates,
} from './core.mjs'
import { comparisonSample } from './sample.mjs'

export function createComparison({ demo, apiKey, anthropicApiKey, directory, fetcher, timeoutMs }) {
  const ledger = new Ledger(directory, COMPARISON_LIMIT)
  let busy = false
  let sampleResult = null
  const resultFile = join(directory, 'result.json')
  const configured = () => demo || Boolean(apiKey && anthropicApiKey)
  return {
    lastResult() {
      if (demo) return sampleResult
      try {
        const result = JSON.parse(readFileSync(resultFile, 'utf8'))
        const combined = combineCandidates([{ spots: result.spots }])
        return {
          ...result,
          ...combined,
          duplicates: (result.duplicates ?? 0) + combined.duplicates,
        }
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw new PilotError(
          'cache',
          '前回の結果を読み取れません。保存ファイルを削除せず開発側へ確認してください。',
          503,
        )
      }
    },
    status: () => ({
      demo,
      configured: configured(),
      busy,
      maxAttempts: COMPARISON_LIMIT,
      attempts: demo ? [] : ledger.read().attempts,
      providers: PROVIDERS.map((provider) => ({
        provider,
        model: MODELS[provider],
        configured: demo || Boolean(provider === 'openai' ? apiKey : anthropicApiKey),
      })),
      maxSearchesPerProvider: SEARCH_LIMIT,
    }),
    async search(input) {
      const query = validateComparisonQuery(input)
      if (!configured())
        throw new PilotError(
          'key',
          'OpenAI・Anthropic両方のAPIキーを .env.research.local に設定し、検索サーバーを再起動してください。まだAPIへ送信していません。',
          503,
        )
      if (busy) throw new PilotError('busy', '比較検索中です。結果を待ってください。', 409)
      const id = demo ? null : ledger.reserve()
      busy = true
      const started = Date.now()
      try {
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
                    redirect: 'error',
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
        if (!demo)
          ledger.finish(
            id,
            reports.every((r) => r.state === 'completed') ? 'completed' : 'failed',
            { providers: reports },
            Date.now() - started,
          )
        const result = {
          ...combined,
          omitted: results.reduce((sum, r) => sum + r.omitted, 0),
          reports,
          query,
          mode: demo ? 'sample' : 'live',
          kind: 'comparison',
          retrievedAt: new Date().toISOString(),
          elapsedMs: Date.now() - started,
        }
        if (demo) sampleResult = result
        else {
          mkdirSync(directory, { recursive: true, mode: 0o700 })
          const temporary = join(directory, `result-${randomUUID()}.tmp`)
          writeFileSync(temporary, JSON.stringify(result), { mode: 0o600 })
          renameSync(temporary, resultFile)
        }
        return result
      } finally {
        busy = false
      }
    },
  }
}
