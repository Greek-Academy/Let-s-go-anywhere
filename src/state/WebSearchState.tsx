import { decodeDriveQuery, driveQuery, driveTheme, withoutDriveTravel } from '../domain/driveSearch'
import type { DriveQuery } from '../domain/driveSearch'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { parseWebSearchResult, sameWebSpot } from '../domain/webSearch'
import { groupPlaces } from '../domain/placeIdentity'
import type { WebSearchResult, WebSpot } from '../domain/webSearch'
import { useApp } from './AppState'
import {
  LOCATION_REGION,
  sameCenter,
  validDiscoveryCenter,
  withoutSearchCoordinates,
} from '../domain/discoveryLocation'
import type { DiscoveryCenter } from '../domain/discoveryLocation'
import { useDiscoveryLocation } from './DiscoveryLocationState'
import { railStation, stationRegion } from '../domain/railStations'
import { searchTheme, searchThemeError } from '../domain/searchTheme'
import { publicSearchOrigin } from '../domain/publicSearchConfig'
import { isNativeApp } from '../platform/runtime'

export interface SearchDraft {
  drive?: DriveQuery
  location?: DiscoveryCenter
  stationId?: string | null
  region: string | null
  theme: string
  category: string
  tag: string
}
type SearchMethod = 'comparison' | 'legacy'
interface SearchStatus {
  searchProvider?: 'comparison' | 'gemini' | 'brave'
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
export type SearchPhase =
  'idle' | 'connecting' | 'waiting' | 'searching' | 'preparing' | 'complete' | 'error'
type HomeSearchOptions = { retry?: boolean; stationId?: string; interactive?: boolean }
interface SearchContext {
  startHomeSearch: (options?: HomeSearchOptions) => void
  homeSearchState: 'idle' | 'locating' | 'ready' | 'done'
  searchPhase: SearchPhase
  cancelHomeSearch: () => void
  savedSpots: WebSpot[]
  active: boolean
  loading: boolean
  waiting: boolean
  cancelSearch: () => void
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
class SearchBusyError extends Error {}
const busyMessages = new Set([
  '別の検索を実行中です。完了してから操作してください。',
  '比較検索中です。結果を待ってください。',
  '検索中です。結果を待ってください。',
])
function pauseForSearch(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const stop = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    }, 2000)
    signal.addEventListener('abort', stop, { once: true })
  })
}
async function json(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('検索サーバーから結果を受け取れませんでした。接続を確認してください。')
  const data = await response.json()
  if (response.status === 409 && busyMessages.has(data?.error))
    throw new SearchBusyError(data.error)
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
        (s.maxAttempts !== null && (!Number.isSafeInteger(s.maxAttempts) || s.maxAttempts < 1)) ||
        !Number.isSafeInteger(s.attemptCount) ||
        s.attemptCount! < 0 ||
        s.demo
      : typeof s.token !== 'string' || !/^[a-f0-9]{64}$/.test(s.token)) ||
    (!publicSearchOrigin &&
      (method === 'comparison'
        ? s.maxAttempts !== null && (!Number.isSafeInteger(s.maxAttempts) || s.maxAttempts < 1)
        : s.maxAttempts !== 3)) ||
    !Array.isArray(s.attempts) ||
    (s.maxAttempts !== null && s.attempts.length > s.maxAttempts)
  )
    throw new Error('検索の利用状態を確認できません。自動では再検索しません。')
  return { ...s, ...(method === 'comparison' ? { kind: 'comparison' as const } : {}) }
}

export function WebSearchProvider({ children }: { children: ReactNode }) {
  const { state, update, toast, memoryOnly, storageProtected } = useApp()
  const gps = useDiscoveryLocation()
  const launchStarted = useRef(false)
  const launchSequence = useRef(0)
  const launchStation = useRef<string | undefined>(undefined)
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle')
  const [startup, setStartup] = useState<'idle' | 'locating' | 'ready' | 'done'>('idle')
  const locationRequest = useRef(false)
  const requestCenter = useRef<DiscoveryCenter | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [waiting, setWaiting] = useState(false)
  type ViewKey = 'places' | 'default' | 'conditions'
  type View = { active: boolean; error: string; result: WebSearchResult | null }
  const emptyView = (): View => ({ active: false, error: '', result: null })
  const [views, setViews] = useState<Record<ViewKey, View>>({
    places: emptyView(),
    default: emptyView(),
    conditions: emptyView(),
  })
  const viewKey: ViewKey =
    state.discover.driveMode === 'default' || state.discover.driveMode === 'conditions'
      ? state.discover.driveMode
      : 'places'
  const requestView = useRef<ViewKey>('places')
  const { active, error, result } = views[viewKey]
  const setActive = (active: boolean) =>
    setViews((v) => ({ ...v, [viewKey]: { ...v[viewKey], active } }))
  const setError = (error: string) =>
    setViews((v) => ({ ...v, [viewKey]: { ...v[viewKey], error } }))
  const setResult = (result: WebSearchResult | null) =>
    setViews((v) => ({ ...v, [viewKey]: { ...v[viewKey], result } }))
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const running = useRef(false)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    setViews(
      (v) =>
        Object.fromEntries(
          Object.entries(v).map(([key, view]) => [
            key,
            { ...view, result: view.result ? withoutSearchCoordinates(view.result) : null },
          ]),
        ) as Record<ViewKey, View>,
    )
    if (locationRequest.current && !sameCenter(requestCenter.current, gps.fix?.center)) {
      sequence.current++
      controller.current?.abort()
      running.current = false
      locationRequest.current = false
      setLoading(false)
      setWaiting(false)
      setSearchPhase('error')
      const key = requestView.current
      setViews((v) => ({
        ...v,
        [key]: {
          ...v[key],
          error: '現在地の利用を終了しました。保存した候補は「行きたい」で確認できます。',
        },
      }))
    }
  }, [gps.fix])
  useEffect(() => {
    const clear = () => {
      launchStarted.current = false
      launchSequence.current++
      launchStation.current = undefined
      setStartup('idle')
      setSearchPhase('idle')
      sequence.current++
      controller.current?.abort()
      running.current = false
      locationRequest.current = false
      setLoading(false)
      setWaiting(false)
      setViews({
        places: emptyView(),
        default: emptyView(),
        conditions: emptyView(),
      })
      setStatus(null)
    }
    // Deleting saved data also ends the in-memory search session. Otherwise old
    // cards survive without their origin/time and the next onboarding skips startup.
    if (!state.onboarded) clear()
    if (!publicSearchOrigin) return
    window.addEventListener('driveplus-search-session-change', clear)
    return () => {
      window.removeEventListener('driveplus-search-session-change', clear)
      controller.current?.abort()
    }
  }, [state.onboarded])
  const showSamples = () => {
    sequence.current++
    setSearchPhase('idle')
    controller.current?.abort()
    running.current = false
    locationRequest.current = false
    setLoading(false)
    setWaiting(false)
    setActive(false)
    setError('')
  }
  const search = async (draft: SearchDraft, method: SearchMethod = 'comparison') => {
    if (running.current) return
    setActive(true)
    setError('')
    setResult(null)
    setStatus(null)
    setSearchPhase('error')
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
    if (method === 'legacy' && (draft.location || draft.region !== '京都府')) {
      setError(
        'Web検索は京都市のみ対応しています。「探す地域」を京都府にすると、その中の京都市を検索します。',
      )
      return
    }
    if (
      method === 'comparison' &&
      (draft.location
        ? !validDiscoveryCenter(draft.location) ||
          draft.region !== LOCATION_REGION ||
          !!draft.stationId
        : !railStation(draft.stationId) ||
          draft.region !== stationRegion(railStation(draft.stationId)!))
    ) {
      setError(
        '探したい駅を入力して、候補から選んでください。現在地から探す場合は、位置を取得し直してください。',
      )
      return
    }
    let drive: DriveQuery | undefined
    try {
      drive = draft.drive ? decodeDriveQuery(draft.drive) : undefined
    } catch {
      setError('検索条件を確認してください。')
      return
    }
    if (draft.category === 'イベント' || drive?.mode === 'events') {
      setError('イベント検索は終了しました。ホームからドライブ先を探してください。')
      return
    }
    const theme = drive ? driveTheme(drive, draft.theme) : searchTheme(draft.theme, draft.tag)
    const inputError = drive
      ? searchThemeError(theme, '') && '気になる場所や、したいことを1〜80文字で入力してください。'
      : searchThemeError(draft.theme, draft.tag)
    if (inputError) {
      setError(inputError)
      return
    }
    const query: WebSearchResult['query'] = {
      ...(drive ? { drive } : {}),
      region: method === 'comparison' ? draft.region! : '京都市',
      theme,
      ...(method === 'comparison'
        ? draft.location
          ? { location: draft.location }
          : { stationId: draft.stationId! }
        : {}),
    }
    const statusPath = `/api/spot-search/${method === 'comparison' ? 'comparison-status' : 'status'}`
    requestView.current = viewKey
    locationRequest.current = !!draft.location
    requestCenter.current = draft.location
    running.current = true
    setLoading(true)
    setSearchPhase('connecting')
    const request = ++sequence.current
    const abort = new AbortController()
    controller.current = abort
    // Waiting and the provider request have separate deadlines. Only an explicit busy
    // rejection can be retried: timeouts/network failures may already have been charged.
    let timer = setTimeout(() => abort.abort(), 130_000)
    let sent = false
    let waitingForSlot = false
    let waitDeadline: number | null = null
    const waitForSlot = async () => {
      abort.signal.throwIfAborted()
      waitDeadline ??= Date.now() + 120_000
      if (Date.now() >= waitDeadline)
        throw new Error(
          '検索が混み合っています。時間をおいて、下の検索ボタンからもう一度お試しください。',
        )
      waitingForSlot = true
      setWaiting(true)
      setSearchPhase('waiting')
      await pauseForSearch(abort.signal)
    }
    try {
      while (true) {
        abort.signal.throwIfAborted()
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
              : config.searchProvider === 'brave'
                ? 'Brave SearchとGeminiの接続準備中です。APIキーを保存したら検索サーバーを再起動してください。'
                : config.searchProvider === 'gemini'
                  ? 'Geminiの接続準備中です。APIキーを保存したら検索サーバーを再起動してください。'
                  : method === 'comparison'
                    ? '比較検索にはOpenAI・Anthropic両方のAPIキーが必要です。Macの .env.research.local を設定して検索サーバーを再起動してください。'
                    : 'APIキーが未設定です。Macの .env.research.local を設定して検索サーバーを再起動してください。',
          )
        if (publicSearchOrigin && config.enabled === false)
          throw new Error(
            '新しい検索は現在停止しています。保存した候補は「行きたい」で確認できます。',
          )
        if (config.busy) {
          await waitForSlot()
          continue
        }
        if (
          !config.demo &&
          config.maxAttempts !== null &&
          (config.attemptCount ?? config.attempts.length) >= config.maxAttempts
        )
          throw new Error(
            publicSearchOrigin
              ? `この接続先の検索上限（${config.maxAttempts}回）に達しました。保存した候補は引き続き確認できます。`
              : `今回の${method === 'comparison' ? '比較検索' : '実検索'}は累計${config.maxAttempts}回までです。取得済みの「行きたい」は引き続き確認できます。`,
          )
        waitingForSlot = false
        setWaiting(false)
        clearTimeout(timer)
        timer = setTimeout(() => abort.abort(), 130_000)
        sent = true
        setSearchPhase('searching')
        let response: unknown
        try {
          response = await json(
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
        } catch (e) {
          if (!(e instanceof SearchBusyError)) throw e
          // Another tab can acquire the slot between GET status and POST compare.
          sent = false
          clearTimeout(timer)
          timer = setTimeout(
            () => abort.abort(),
            Math.max(1, (waitDeadline ?? Date.now() + 120_000) - Date.now()) + 10_000,
          )
          await waitForSlot()
          continue
        }
        if (request !== sequence.current) return
        setSearchPhase('preparing')
        const next = await parseWebSearchResult(response, query)
        if ((config.searchProvider === 'brave') !== (next.searchBackend === 'brave'))
          throw new Error('検索元と接続先が一致しません。画面を更新してお試しください。')
        if ((method === 'comparison') !== (next.kind === 'comparison'))
          throw new Error('検索方法と結果が一致しません。')
        if ((config.demo ? 'sample' : 'live') !== next.mode)
          throw new Error('検索モードと結果が一致しません。')
        if (request === sequence.current) {
          setResult(next)
        }
        break
      }
    } catch (e) {
      if (request === sequence.current) {
        setSearchPhase('error')
        setError(
          abort.signal.aborted
            ? waitingForSlot
              ? '検索が混み合っています。時間をおいて、下の検索ボタンからもう一度お試しください。'
              : '検索結果を受け取れませんでした。送信済みの処理には料金が発生する場合があります。自動では再検索しません。'
            : e instanceof Error
              ? e.message
              : '検索を完了できませんでした。',
        )
      }
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
          locationRequest.current = false
          setLoading(false)
          setWaiting(false)
          setSearchPhase((phase) => (phase === 'preparing' ? 'complete' : phase))
        }
      }
    }
  }
  // Kept in the app provider: visiting another tab/detail does not start a paid search again.
  // A fresh app load (or a new signed-in session) gets one automatic attempt, with no retries.
  const startHomeSearch = (options: HomeSearchOptions = {}) => {
    if (
      !options.interactive &&
      (memoryOnly || (!publicSearchOrigin && (!import.meta.env.DEV || isNativeApp)))
    )
      return
    if (
      (launchStarted.current && !options.retry) ||
      !state.onboarded ||
      running.current ||
      gps.loading
    )
      return
    // Also consume an unsupported/cancelled attempt, so entering home never auto-retries it.
    launchStarted.current = true
    const attempt = ++launchSequence.current
    launchStation.current = options.stationId
    setViews((views) => ({ ...views, default: emptyView() }))
    setSearchPhase('idle')
    update((s) => ({
      ...s,
      discover: {
        ...s.discover,
        category: 'おすすめ',
        driveMode: 'default',
        usageSamples: false,
        ...(options.stationId ? { region: 'station', stationId: options.stationId } : {}),
      },
    }))
    if (memoryOnly || (!publicSearchOrigin && (!import.meta.env.DEV || isNativeApp))) {
      setStartup('done')
      setSearchPhase('error')
      setViews((views) => ({
        ...views,
        default: { active: true, result: null, error: unavailable },
      }))
      return
    }
    if (options.stationId) {
      gps.reset()
      setStartup('ready')
      return
    }
    if (gps.fix) {
      setStartup('ready')
      return
    }
    setStartup('locating')
    void gps.locate().then((ok) => {
      if (attempt === launchSequence.current) setStartup(ok ? 'ready' : 'done')
    })
  }
  const cancelHomeSearch = () => {
    launchStarted.current = true
    launchSequence.current++
    setStartup('done')
    gps.cancel()
    showSamples()
  }
  useEffect(() => {
    if (startup !== 'ready') return
    setStartup('done')
    // A different search/selection made while GPS was pending takes precedence.
    if (viewKey !== 'default' || running.current) return
    const station = railStation(launchStation.current)
    if (!station && !gps.fix) return
    const drive = driveQuery('default', state.driveChoices, state.profile.interests)
    void search({
      drive,
      region: station ? stationRegion(station) : LOCATION_REGION,
      ...(station ? { stationId: station.id } : { location: gps.fix!.center }),
      theme: driveTheme(drive, ''),
      category: 'おすすめ',
      tag: '',
    })
  }, [startup, gps.fix, viewKey])
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
      const candidate = response as { query?: WebSearchResult['query'] }
      if (typeof candidate.query?.region !== 'string' || typeof candidate.query?.theme !== 'string')
        throw new Error('保存された検索条件を確認できません。')
      if (candidate.query.purpose === 'events' || candidate.query.drive?.mode === 'events')
        throw new Error('イベント検索は終了しました。保存した候補は「行きたい」で確認できます。')
      const next = await parseWebSearchResult(response, {
        region: candidate.query.region,
        theme: candidate.query.theme,
        purpose: candidate.query.purpose,
        eventDates: candidate.query.eventDates,
        drive: candidate.query.drive,
      })
      if (next.kind !== 'comparison' || next.mode !== (config.demo ? 'sample' : 'live'))
        throw new Error('保存された検索方法を確認できません。')
      if (request === sequence.current) {
        const restoredKey =
          next.query.drive?.mode === 'default' || next.query.drive?.mode === 'conditions'
            ? next.query.drive.mode
            : 'places'
        setViews((v) => ({ ...v, [restoredKey]: { active: true, error: '', result: next } }))
        update((s) => ({
          ...s,
          discover: {
            ...s.discover,
            category: 'おすすめ',
            driveMode: restoredKey === 'places' ? 'free' : restoredKey,
          },
        }))
      }
    } catch (e) {
      if (request === sequence.current)
        setError(e instanceof Error ? e.message : '前回の結果を開けませんでした。')
    } finally {
      clearTimeout(timer)
      if (request === sequence.current) {
        running.current = false
        setLoading(false)
        setWaiting(false)
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
        : [...s.savedWebSpots, withoutDriveTravel(spot)],
    }))
    toast(saved ? '行きたいから外しました' : '未確認のWeb候補を行きたいに追加しました')
  }
  return (
    <Context.Provider
      value={{
        startHomeSearch,
        homeSearchState: startup,
        searchPhase,
        cancelHomeSearch,
        savedSpots: groupPlaces(state.savedWebSpots),
        active,
        loading,
        waiting,
        cancelSearch: showSamples,
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
