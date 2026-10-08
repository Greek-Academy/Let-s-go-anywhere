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
  combineCandidates,
} from './core.mjs'
import { runComparison } from './providers.mjs'

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
        const result = await runComparison({
          query,
          demo,
          apiKey,
          anthropicApiKey,
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
