import { createContext, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { parseWebSearchResult } from '../domain/webSearch'
import type { WebSearchResult, WebSpot } from '../domain/webSearch'
import { useApp } from './AppState'
import { isNativeApp } from '../platform/runtime'

interface SearchDraft {
  region: string | null
  theme: string
  category: string
  tag: string
}
interface SearchStatus {
  demo: boolean
  configured: boolean
  token: string
  busy: boolean
  maxAttempts: number
  attempts: unknown[]
}
interface SearchContext {
  active: boolean
  loading: boolean
  error: string
  result: WebSearchResult | null
  status: SearchStatus | null
  search: (draft: SearchDraft) => Promise<void>
  showSamples: () => void
  toggleSaved: (spot: WebSpot) => void
}
const Context = createContext<SearchContext | null>(null)
const unavailable =
  'Web検索はMacの開発画面で確認できます。このiPhone版・静的プレビューには検索サーバーをまだ接続していません。'

async function json(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('検索サーバーから結果を受け取れませんでした。接続を確認してください。')
  const data = await response.json()
  if (!response.ok)
    throw new Error(typeof data?.error === 'string' ? data.error : '検索を完了できませんでした。')
  return data
}
function readStatus(value: unknown): SearchStatus {
  const s = value as SearchStatus
  if (
    !s ||
    typeof s.demo !== 'boolean' ||
    typeof s.configured !== 'boolean' ||
    typeof s.busy !== 'boolean' ||
    typeof s.token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(s.token) ||
    s.maxAttempts !== 3 ||
    !Array.isArray(s.attempts) ||
    s.attempts.length > 3
  )
    throw new Error('検索の利用状態を確認できません。自動では再検索しません。')
  return s
}

export function WebSearchProvider({ children }: { children: ReactNode }) {
  const { state, update, toast, memoryOnly, storageProtected } = useApp()
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<WebSearchResult | null>(null)
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const running = useRef(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const showSamples = () => {
    sequence.current++
    controller.current?.abort()
    running.current = false
    setLoading(false)
    setActive(false)
    setError('')
  }
  const search = async (draft: SearchDraft) => {
    if (running.current) return
    setActive(true)
    setError('')
    setResult(null)
    if (
      !import.meta.env.DEV ||
      isNativeApp ||
      memoryOnly ||
      !['localhost', '127.0.0.1'].includes(location.hostname)
    ) {
      setError(unavailable)
      return
    }
    if (draft.region !== '京都府') {
      setError(
        'Web検索は京都市のみ対応しています。「探す地域」を京都府にすると、その中の京都市を検索します。',
      )
      return
    }
    const theme = draft.theme.trim()
    if (!theme || theme.length > 80 || /[\u0000-\u001f\u007f]/u.test(theme)) {
      setError('気になる場所や、したいことを1〜80文字で入力してください。')
      return
    }
    if (!['おすすめ', 'スポット'].includes(draft.category) || draft.tag) {
      setError(
        'Web検索は常設スポットが対象です。「おすすめ」か「スポット」を選び、興味の絞り込みを解除してください。希望は検索欄へ入力できます。',
      )
      return
    }
    const query = { region: '京都市', theme }
    running.current = true
    setLoading(true)
    const request = ++sequence.current
    const abort = new AbortController()
    controller.current = abort
    const timer = setTimeout(() => abort.abort(), 130_000)
    let sent = false
    try {
      const config = readStatus(
        await json(
          await fetch('/api/spot-search/status', { signal: abort.signal, cache: 'no-store' }),
        ),
      )
      if (request !== sequence.current) return
      setStatus(config)
      if (!config.configured)
        throw new Error(
          'APIキーが未設定です。Macの .env.research.local を設定して検索サーバーを再起動してください。',
        )
      if (config.busy) throw new Error('別の検索を実行中です。完了してから操作してください。')
      if (!config.demo && config.attempts.length >= config.maxAttempts)
        throw new Error('今回の実検索は3回までです。取得済みの「行きたい」は引き続き確認できます。')
      sent = true
      const response = await json(
        await fetch('/api/spot-search/search', {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json', 'X-Pilot-Token': config.token },
          body: JSON.stringify(query),
        }),
      )
      const next = await parseWebSearchResult(response, query)
      if ((config.demo ? 'sample' : 'live') !== next.mode)
        throw new Error('検索モードと結果が一致しません。')
      if (request === sequence.current) setResult(next)
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
                await fetch('/api/spot-search/status', {
                  cache: 'no-store',
                  signal: AbortSignal.timeout(5000),
                }),
              ),
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
  const toggleSaved = (spot: WebSpot) => {
    if (storageProtected) {
      toast('元の保存データを保護しています。保存状態の案内を確認してください。')
      return
    }
    const saved = state.savedWebSpots.some((s) => s.id === spot.id)
    if (!saved && state.savedWebSpots.length >= 500) {
      toast('Web候補は500件までです。不要な候補を解除してから保存してください。')
      return
    }
    update((s) => ({
      ...s,
      savedWebSpots: saved
        ? s.savedWebSpots.filter((item) => item.id !== spot.id)
        : [...s.savedWebSpots.filter((item) => item.id !== spot.id), spot],
    }))
    toast(saved ? '行きたいから外しました' : '未確認のWeb候補を行きたいに追加しました')
  }
  return (
    <Context.Provider
      value={{ active, loading, error, result, status, search, showSamples, toggleSaved }}
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
