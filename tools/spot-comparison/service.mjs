import { withoutSearchCoordinates } from '../../src/domain/discoveryLocation.ts'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Ledger } from '../spot-research/ledger.mjs'
import { PilotError } from '../spot-research/core.mjs'
import {
  MODELS,
  SEARCH_LIMIT,
  COMPARISON_LIMIT,
  localComparisonLimit,
  validateComparisonQuery,
  combineCandidates,
  searchProviders,
} from './core.mjs'
import { runComparison } from './providers.mjs'

export function createComparison({
  demo,
  apiKey,
  anthropicApiKey,
  routesApiKey,
  geminiApiKey,
  braveApiKey,
  searchProvider = 'comparison',
  directory,
  fetcher,
  timeoutMs,
  maxAttempts = COMPARISON_LIMIT,
}) {
  const limit = localComparisonLimit(maxAttempts)
  const providers = searchProviders(searchProvider)
  const ledger = new Ledger(directory, limit)
  let busy = false
  let sampleResult = null
  const resultFile = join(directory, 'result.json')
  const configured = () =>
    demo ||
    (searchProvider === 'brave'
      ? Boolean(geminiApiKey && braveApiKey)
      : searchProvider === 'gemini'
        ? Boolean(geminiApiKey)
        : Boolean(apiKey && anthropicApiKey))
  return {
    lastResult() {
      // Grounded Gemini answers and search suggestions remain in the current view only.
      // In particular, do not persist suggestions that might contain location queries.
      if (searchProvider !== 'comparison') return null
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
      searchProvider,
      busy,
      maxAttempts: limit,
      attempts: demo ? [] : ledger.read().attempts,
      providers: providers.map((provider) => ({
        provider,
        model: MODELS[provider],
        configured:
          demo ||
          Boolean(
            provider === 'gemini' ? geminiApiKey : provider === 'openai' ? apiKey : anthropicApiKey,
          ),
      })),
      // Google Search controls its own query count; the prompt target is not a hard cap.
      maxSearchesPerProvider:
        searchProvider === 'brave' ? 4 : searchProvider === 'gemini' ? null : SEARCH_LIMIT,
    }),
    async search(input) {
      const query = validateComparisonQuery(input)
      if (!configured())
        throw new PilotError(
          'key',
          searchProvider === 'brave'
            ? 'Brave SearchとGeminiのAPIキーを設定し、検索サーバーを再起動してください。まだAPIへ送信していません。'
            : searchProvider === 'gemini'
              ? 'GeminiのAPIキーを .env.gemini.local に設定し、検索サーバーを再起動してください。まだAPIへ送信していません。'
              : 'OpenAI・Anthropic両方のAPIキーを .env.research.local に設定し、検索サーバーを再起動してください。まだAPIへ送信していません。',
          503,
        )
      if (busy) throw new PilotError('busy', '比較検索中です。結果を待ってください。', 409)
      const id = demo ? null : ledger.reserve()
      busy = true
      const started = Date.now()
      try {
        const result = await runComparison({
          query,
          demo,
          apiKey,
          anthropicApiKey,
          routesApiKey,
          geminiApiKey,
          braveApiKey,
          searchProvider,
          fetcher,
          timeoutMs,
        })
        const { reports } = result
        if (!demo)
          ledger.finish(
            id,
            reports.every((r) => r.state === 'completed') ? 'completed' : 'failed',
            { providers: reports },
            Date.now() - started,
          )
        if (searchProvider !== 'comparison') return result
        if (demo) sampleResult = withoutSearchCoordinates(result)
        else {
          mkdirSync(directory, { recursive: true, mode: 0o700 })
          const temporary = join(directory, `result-${randomUUID()}.tmp`)
          writeFileSync(temporary, JSON.stringify(withoutSearchCoordinates(result)), {
            mode: 0o600,
          })
          renameSync(temporary, resultFile)
        }
        return result
      } finally {
        busy = false
      }
    },
  }
}
