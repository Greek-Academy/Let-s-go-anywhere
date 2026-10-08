import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { parseWebSearchResult, sameWebSpot } from '../domain/webSearch'
import { groupPlaces } from '../domain/placeIdentity'
import type { WebSearchResult, WebSpot } from '../domain/webSearch'
import { useApp } from './AppState'
import { prefectures } from '../data/regions'
import { searchTheme, searchThemeError } from '../domain/searchTheme'
import { publicSearchOrigin } from '../domain/publicSearchConfig'
import { isNativeApp } from '../platform/runtime'

interface SearchDraft {
  region: string | null
  theme: string
  category: string
  tag: string
}
export type SearchMethod = 'comparison' | 'legacy'
export interface ComparisonView {
  order: 'general' | 'personal'
  provider: 'all' | 'openai' | 'anthropic'
}
interface SearchStatus {
  kind?: 'comparison'
  demo: boolean
  configured: boolean
  token?: string
  enabled?: boolean
  globalRemaining?: number | null
  attemptCount?: number
  busy: boolean
  maxAttempts: number | null
  attempts: unknown[]
}
interface SearchContext {
  savedSpots: WebSpot[]
  method: SearchMethod
  setMethod: (method: SearchMethod) => void
  comparisonView: ComparisonView
  setComparisonView: (patch: Partial<ComparisonView>) => void
  active: boolean
  loading: boolean
  error: string
  result: WebSearchResult | null
  status: SearchStatus | null
  search: (draft: SearchDraft, method?: SearchMethod) => Promise<void>
  showSamples: () => void
  restoreComparison: () => Promise<void>
  toggleSaved: (spot: WebSpot) => void
}
const Context = createContext<SearchContext | null>(null)
const unavailable =
  'Web検索はMacの開発画面で確認できます。このiPhone版・静的プレビューには検索サーバーをまだ接続していません。'

async function requestApi(path: string, options: RequestInit = {}) {
  if (publicSearchOrigin) {
    const { publicSearchFetch } = await import('../firebase/publicSearch')
    return publicSearchFetch(path.replace('/api/spot-search/', ''), options)
  }
  return fetch(path, options)
}
async function json(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('検索サーバーから結果を受け取れませんでした。接続を確認してください。')
  const data = await response.json()
  if (!response.ok)
    throw new Error(typeof data?.error === 'string' ? data.error : '検索を完了できませんでした。')
  return data
}
function readStatus(value: unknown, method: SearchMethod): SearchStatus {
  const s = value as SearchStatus
  if (
    !s ||
    typeof s.demo !== 'boolean' ||
    typeof s.configured !== 'boolean' ||
    typeof s.busy !== 'boolean' ||
    (publicSearchOrigin
      ? typeof s.enabled !== 'boolean' ||
        s.globalRemaining !== null ||
        s.maxAttempts !== null ||
        !Number.isSafeInteger(s.attemptCount) ||
        s.attemptCount! < 0 ||
        s.demo
      : typeof s.token !== 'string' || !/^[a-f0-9]{64}$/.test(s.token)) ||
    (!publicSearchOrigin && s.maxAttempts !== (method === 'comparison' ? 1 : 3)) ||
    !Array.isArray(s.attempts) ||
    s.attempts.length > (s.maxAttempts ?? 1)
  )
    throw new Error('検索の利用状態を確認できません。自動では再検索しません。')
  return { ...s, ...(method === 'comparison' ? { kind: 'comparison' as const } : {}) }
}

export function WebSearchProvider({ children }: { children: ReactNode }) {
  const { state, update, toast, memoryOnly, storageProtected } = useApp()
  const [method, setMethod] = useState<SearchMethod>('comparison')
  const [comparisonView, setView] = useState<ComparisonView>({ order: 'general', provider: 'all' })
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<WebSearchResult | null>(null)
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const running = useRef(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!publicSearchOrigin) return
    const clear = () => {
      sequence.current++
      controller.current?.abort()
      running.current = false
      setLoading(false)
      setResult(null)
      setStatus(null)
      setError('')
      setActive(false)
    }
    window.addEventListener('driveplus-search-session-change', clear)
    return () => {
      window.removeEventListener('driveplus-search-session-change', clear)
      controller.current?.abort()
    }
  }, [])
  const showSamples = () => {
    sequence.current++
    controller.current?.abort()
    running.current = false
    setLoading(false)
    setActive(false)
    setError('')
  }
  const search = async (draft: SearchDraft, method: SearchMethod = 'legacy') => {
    if (running.current) return
    setActive(true)
    setError('')
    setResult(null)
    setStatus(null)
    if (
      memoryOnly ||
      (!publicSearchOrigin &&
        (!import.meta.env.DEV ||
          isNativeApp ||
          !['localhost', '127.0.0.1'].includes(location.hostname)))
    ) {
      setError(unavailable)
      return
    }
    if (publicSearchOrigin && method !== 'comparison') {
      setError('公開テストはOpenAI・Claudeの比較検索を選んでください。')
      return
    }
    if (method === 'legacy' && draft.region !== '京都府') {
      setError(
        'Web検索は京都市のみ対応しています。「探す地域」を京都府にすると、その中の京都市を検索します。',
      )
      return
    }
    if (
      method === 'comparison' &&
      (!draft.region || !prefectures.some((p) => p === draft.region))
    ) {
      setError('比較検索は探す地域を都道府県で選んでください。')
      return
    }
    const theme = searchTheme(draft.theme, draft.tag)
    const inputError = searchThemeError(draft.theme, draft.tag)
    if (inputError) {
      setError(inputError)
      return
    }
    if (!['おすすめ', 'スポット'].includes(draft.category)) {
      setError('Web検索は常設スポットが対象です。「おすすめ」か「スポット」を選んでください。')
      return
    }
    const query = { region: method === 'comparison' ? draft.region! : '京都市', theme }
    const statusPath = `/api/spot-search/${method === 'comparison' ? 'comparison-status' : 'status'}`
    running.current = true
    setLoading(true)
    const request = ++sequence.current
    const abort = new AbortController()
    controller.current = abort
    const timer = setTimeout(() => abort.abort(), 130_000)
    let sent = false
    try {
      const config = readStatus(
        await json(await requestApi(statusPath, { signal: abort.signal, cache: 'no-store' })),
        method,
      )
      if (request !== sequence.current) return
      setStatus(config)
      if (!config.configured)
        throw new Error(
          publicSearchOrigin
            ? '検索サービスの接続準備中です。案内した担当者にお知らせください。'
            : method === 'comparison'
              ? '比較検索にはOpenAI・Anthropic両方のAPIキーが必要です。Macの .env.research.local を設定して検索サーバーを再起動してください。'
              : 'APIキーが未設定です。Macの .env.research.local を設定して検索サーバーを再起動してください。',
        )
      if (publicSearchOrigin && config.enabled === false)
        throw new Error('新しい検索は現在停止しています。前回の結果は開けます。')
      if (config.busy) throw new Error('別の検索を実行中です。完了してから操作してください。')
      if (
        !config.demo &&
        config.maxAttempts !== null &&
        config.attempts.length >= config.maxAttempts
      )
        throw new Error(
          `今回の${method === 'comparison' ? '比較検索は1回' : '実検索は3回'}までです。取得済みの「行きたい」は引き続き確認できます。`,
        )
      sent = true
      const response = await json(
        await requestApi(`/api/spot-search/${method === 'comparison' ? 'compare' : 'search'}`, {
          method: 'POST',
          signal: abort.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(!publicSearchOrigin ? { 'X-Pilot-Token': config.token! } : {}),
          },
          body: JSON.stringify(query),
        }),
      )
      const next = await parseWebSearchResult(response, query)
      if ((method === 'comparison') !== (next.kind === 'comparison'))
        throw new Error('検索方法と結果が一致しません。')
      if ((config.demo ? 'sample' : 'live') !== next.mode)
        throw new Error('検索モードと結果が一致しません。')
      if (request === sequence.current) {
        setResult(next)
        setView({ order: 'general', provider: 'all' })
      }
    } catch (e) {
      if (request === sequence.current)
        setError(
          abort.signal.aborted
            ? '検索結果を受け取れませんでした。送信後の試行は回数に含まれる場合があります。自動では再検索しません。'
            : e instanceof Error
              ? e.message
              : '検索を完了できませんでした。',
        )
    } finally {
      clearTimeout(timer)
      if (request === sequence.current) {
        if (sent) {
          try {
            const updated = readStatus(
              await json(
                await requestApi(statusPath, {
                  cache: 'no-store',
                  signal: AbortSignal.timeout(5000),
                }),
              ),
              method,
            )
            if (request === sequence.current) setStatus(updated)
          } catch {
            if (request === sequence.current) setStatus(null)
          }
        }
        if (request === sequence.current) {
          running.current = false
          setLoading(false)
        }
      }
    }
  }
  const restoreComparison = async () => {
    if (running.current) return
    setActive(true)
    setError('')
    if (
      memoryOnly ||
      (!publicSearchOrigin &&
        (!import.meta.env.DEV ||
          isNativeApp ||
          !['localhost', '127.0.0.1'].includes(location.hostname)))
    ) {
      setError(unavailable)
      return
    }
    running.current = true
    setLoading(true)
    const request = ++sequence.current
    const abort = new AbortController()
    controller.current = abort
    const timer = setTimeout(() => abort.abort(), 10_000)
    try {
      const config = readStatus(
        await json(
          await requestApi('/api/spot-search/comparison-status', {
            cache: 'no-store',
            signal: abort.signal,
          }),
        ),
        'comparison',
      )
      if (request !== sequence.current) return
      setStatus(config)
      const response = await json(
        await requestApi('/api/spot-search/comparison-result', {
          headers: { ...(!publicSearchOrigin ? { 'X-Pilot-Token': config.token! } : {}) },
          cache: 'no-store',
          signal: abort.signal,
        }),
      )
      if (!response)
        throw new Error(
          publicSearchOrigin
            ? '開ける結果がありません。まだ検索していない、検索を完了できなかった、または7日間の保存期間を過ぎた可能性があります。'
            : '前回の比較結果はまだありません。検索を実行すると、このMacで開き直せます。',
        )
      const candidate = response as { query?: { region?: unknown; theme?: unknown } }
      if (typeof candidate.query?.region !== 'string' || typeof candidate.query?.theme !== 'string')
        throw new Error('保存された検索条件を確認できません。')
      const next = await parseWebSearchResult(response, {
        region: candidate.query.region,
        theme: candidate.query.theme,
      })
      if (next.kind !== 'comparison' || next.mode !== (config.demo ? 'sample' : 'live'))
        throw new Error('保存された検索方法を確認できません。')
      if (request === sequence.current) setResult(next)
    } catch (e) {
      if (request === sequence.current)
        setError(e instanceof Error ? e.message : '前回の結果を開けませんでした。')
    } finally {
      clearTimeout(timer)
      if (request === sequence.current) {
        running.current = false
        setLoading(false)
      }
    }
  }
  const toggleSaved = (spot: WebSpot) => {
    if (storageProtected) {
      toast('元の保存データを保護しています。保存状態の案内を確認してください。')
      return
    }
    const saved = state.savedWebSpots.some((s) => sameWebSpot(s, spot))
    if (!saved && state.savedWebSpots.length >= 500) {
      toast('Web候補は500件までです。不要な候補を解除してから保存してください。')
      return
    }
    update((s) => ({
      ...s,
      savedWebSpots: saved
        ? s.savedWebSpots.filter((item) => !sameWebSpot(item, spot))
        : [...s.savedWebSpots, spot],
    }))
    toast(saved ? '行きたいから外しました' : '未確認のWeb候補を行きたいに追加しました')
  }
  return (
    <Context.Provider
      value={{
        savedSpots: groupPlaces(state.savedWebSpots),
        method,
        setMethod,
        comparisonView,
        setComparisonView: (patch) => setView((v) => ({ ...v, ...patch })),
        active,
        loading,
        error,
        result,
        status,
        search,
        showSamples,
        restoreComparison,
        toggleSaved,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useWebSearch() {
  const value = useContext(Context)
  if (!value) throw new Error('WebSearchProvider is required')
  return value
}
