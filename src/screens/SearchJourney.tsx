import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CheckCircle2, MapPin, RotateCcw, TrainFront } from 'lucide-react'
import { BottomSheet, Brand, PrimaryButton } from '../components/ui'
import { StationPicker } from '../components/StationPicker'
import { SearchJourneyCar } from '../components/SearchJourneyCar'
import { searchJourneyPhotos } from '../data/searchJourneyPhotos'
import { railStation } from '../domain/railStations'
import { useApp } from '../state/AppState'
import { useDiscoveryLocation } from '../state/DiscoveryLocationState'
import { useWebSearch } from '../state/WebSearchState'
import type { SearchPhase } from '../state/WebSearchState'
import './searchJourney.css'

type Phase = SearchPhase | 'locating' | 'done'
const stages: Record<Phase, { title: string; detail: string; from: number; to: number }> = {
  idle: {
    title: '出発の準備をしています',
    detail: '選んだ趣味を、ドライブのきっかけに。',
    from: 0,
    to: 4,
  },
  locating: {
    title: '現在地を確認しています',
    detail: '位置情報の許可が表示されたら、選択してください。',
    from: 4,
    to: 12,
  },
  connecting: {
    title: '行き先を探す準備をしています',
    detail: '検索サービスに接続しています。',
    from: 14,
    to: 22,
  },
  waiting: {
    title: '検索の順番を待っています',
    detail: 'このままお待ちください。順番が来たら検索します。',
    from: 22,
    to: 28,
  },
  searching: {
    title: 'あなたの好きに合う行き先を探しています',
    detail: 'スポットの情報と、ドライブの道のりを調べています。',
    from: 28,
    to: 92,
  },
  preparing: {
    title: 'おすすめのパネルを準備しています',
    detail: '届いた情報を確認しています。',
    from: 94,
    to: 98,
  },
  complete: {
    title: 'おすすめのパネルを準備しています',
    detail: '届いた情報を確認しています。',
    from: 98,
    to: 99,
  },
  error: { title: '検索を一度止めています', detail: '', from: 0, to: 0 },
  done: {
    title: '出発の準備ができました',
    detail: 'おすすめのドライブ先が見つかりました。',
    from: 100,
    to: 100,
  },
}

/** Estimated animation is capped below 100; only a usable completed response finishes it. */
function useJourneyProgress(phase: Phase, attempt: number) {
  const [progress, setProgress] = useState(0)
  useEffect(() => setProgress(0), [attempt])
  useEffect(() => {
    if (phase === 'done') {
      setProgress(100)
      return
    }
    if (phase === 'error') return
    const stage = stages[phase]
    const since = performance.now()
    const advance = () => {
      const fraction =
        1 - Math.exp(-(performance.now() - since) / (phase === 'searching' ? 16000 : 8000))
      setProgress((previous) =>
        Math.max(previous, Math.min(99, stage.from + (stage.to - stage.from) * fraction)),
      )
    }
    advance()
    const timer = setInterval(advance, 200)
    return () => clearInterval(timer)
  }, [phase, attempt])
  return progress
}

export function SearchJourney() {
  const { state } = useApp()
  const web = useWebSearch()
  const gps = useDiscoveryLocation()
  const navigate = useNavigate()
  const [photoIndex, setPhotoIndex] = useState(0)
  const [broken, setBroken] = useState<string[]>([])
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [stationOpen, setStationOpen] = useState(false)
  const [stationId, setStationId] = useState<string | null>(state.discover.stationId ?? null)
  const [attempt, setAttempt] = useState(0)
  const retryStation = useRef<string | undefined>(undefined)
  const actions = useRef(web)
  actions.current = web
  const [initiated, setInitiated] = useState(false)
  const started = useRef(false)
  const leavingWithResults = useRef(false)
  const ready = initiated && !web.loading && !web.error && !!web.result?.spots.length
  const settled = initiated && web.homeSearchState === 'done' && !web.loading && !gps.loading
  const empty = settled && !!web.result && !web.result.spots.length
  const failure = !ready && settled
  const phase: Phase = ready
    ? 'done'
    : failure
      ? 'error'
      : gps.loading || web.homeSearchState === 'locating'
        ? 'locating'
        : web.searchPhase
  const progress = useJourneyProgress(phase, attempt)
  const photo = searchJourneyPhotos[photoIndex]
  const failedReport = web.result?.reports?.some((report) => report.state === 'failed')
  const locationFailed = failure && !web.active && !web.result
  const searchFailed = !locationFailed && (!!web.error || !!failedReport)
  const failureDetail =
    web.error ||
    web.result?.reports
      ?.filter((report) => report.state === 'failed' && report.error)
      .map((report) => report.error)
      .join('\n') ||
    gps.error
  const failureTitle = locationFailed
    ? '出発地を選んで、旅をはじめよう'
    : empty && !failedReport
      ? 'この条件の行き先が見つかりませんでした'
      : '検索を完了できませんでした'

  useEffect(() => {
    // The deferred start survives StrictMode without issuing a second location/API request.
    const timer = setTimeout(() => {
      started.current = true
      actions.current.startHomeSearch({ retry: true, interactive: true })
      setInitiated(true)
    }, 0)
    return () => {
      clearTimeout(timer)
      if (started.current && !leavingWithResults.current) actions.current.cancelHomeSearch()
    }
  }, [])
  useEffect(() => {
    if (ready || failure || creditsOpen || stationOpen) return
    const timer = setInterval(() => {
      if (!document.hidden) setPhotoIndex((i) => (i + 1) % searchJourneyPhotos.length)
    }, 7500)
    return () => clearInterval(timer)
  }, [ready, failure, creditsOpen, stationOpen])
  useEffect(() => {
    if (!ready || creditsOpen || stationOpen) return
    const timer = setTimeout(() => {
      leavingWithResults.current = true
      navigate('/discover', { replace: true })
    }, 1100)
    return () => clearTimeout(timer)
  }, [ready, creditsOpen, stationOpen, navigate])

  const retry = (station?: string) => {
    retryStation.current = station
    setAttempt((n) => n + 1)
    web.startHomeSearch({ retry: true, stationId: station, interactive: true })
  }
  const exit = () => {
    web.cancelHomeSearch()
    navigate('/discover', { replace: true })
  }
  if (!state.onboarded) return <Navigate to="/onboarding/1" replace />
  return (
    <section
      className={`search-journey ${ready ? 'journey-ready' : ''} ${failure ? 'journey-stopped' : ''}`}
      aria-label="ドライブ先を探しています"
    >
      <h1 className="sr-only">
        {ready ? 'ドライブ先が見つかりました' : 'ドライブ先を探しています'}
      </h1>
      <div
        className="journey-scenery"
        role="img"
        aria-label={`${photo.region}、${photo.name}の風景写真`}
      >
        {searchJourneyPhotos.map((scene, i) => (
          <div key={scene.id} className={`journey-scene ${i === photoIndex ? 'active' : ''}`}>
            {broken.includes(scene.id) ? (
              <span className="journey-photo-missing">写真を読み込めませんでした</span>
            ) : (
              <img
                src={scene.src}
                alt=""
                style={{ objectPosition: scene.position }}
                decoding="async"
                onError={() => setBroken((items) => [...items, scene.id])}
              />
            )}
          </div>
        ))}
        <div className="journey-shade" />
      </div>
      <header className="journey-top">
        <Brand small />
        {!ready && (
          <button type="button" onClick={exit} className="journey-exit">
            {failure ? 'ホームへ' : '検索をやめる'}
          </button>
        )}
      </header>
      <div className="journey-story">
        <div className="journey-index" aria-hidden="true">
          <span>JAPAN, THROUGH THE WINDOW</span>
          <span>
            {String(photoIndex + 1).padStart(2, '0')} <i /> 04
          </span>
        </div>
        <p className="journey-region">
          <MapPin size={13} aria-hidden="true" />
          {photo.region}
        </p>
        <h2>{photo.name}</h2>
        <p className="journey-comment">{photo.comment}</p>
        <div className="journey-photo-dots" aria-hidden="true">
          {searchJourneyPhotos.map((scene, i) => (
            <i key={scene.id} className={i === photoIndex ? 'active' : ''} />
          ))}
        </div>
      </div>
      <div className="journey-bottom">
        {failure ? (
          <div className="journey-recovery">
            <h2 role="alert">{failureTitle}</h2>
            <p>
              {locationFailed
                ? '位置情報を使わず、駅からも探せます。'
                : searchFailed
                  ? '詳しい状況を確認して、もう一度お試しください。'
                  : '出発地を変えるか、もう一度お試しください。'}
            </p>
            {failureDetail && (
              <details>
                <summary>詳しい状況</summary>
                <p>{failureDetail}</p>
              </details>
            )}
            <PrimaryButton
              icon={searchFailed ? RotateCcw : TrainFront}
              onClick={() => (searchFailed ? retry(retryStation.current) : setStationOpen(true))}
            >
              {searchFailed ? 'もう一度検索する' : '駅を選んで探す'}
            </PrimaryButton>
            <button
              type="button"
              className="journey-retry"
              onClick={() => (searchFailed ? setStationOpen(true) : retry(retryStation.current))}
            >
              {searchFailed ? <TrainFront size={14} /> : <RotateCcw size={14} />}
              {searchFailed
                ? '駅を選んで探す'
                : locationFailed
                  ? '現在地をもう一度取得する'
                  : 'もう一度検索する'}
            </button>
          </div>
        ) : (
          <div className="journey-progress">
            <div className="journey-progress-label">
              <strong>{stages[phase].title}</strong>
              <span className="journey-number" aria-hidden="true">
                {Math.floor(progress)}
                <small>%</small>
              </span>
            </div>
            <div
              className="journey-road"
              role="progressbar"
              aria-label="ドライブ先の検索の進み具合（目安）"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(progress)}
              style={{ '--journey-progress': progress } as CSSProperties}
            >
              <div className="journey-road-bed">
                <div className="journey-road-fill" />
                <div className="journey-road-dashes" />
              </div>
              <svg className="journey-finish" viewBox="0 0 14 20" aria-hidden="true">
                <path
                  d="M2 20V2m0 1c4-4 6 4 11 0v8c-5 4-7-4-11 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
              </svg>
              <div className="journey-car-lane">
                <SearchJourneyCar />
              </div>
            </div>
            <div className="journey-road-labels">
              <span>START</span>
              <span>{ready ? 'READY TO GO' : '進み具合の目安'}</span>
            </div>
            <p className="journey-activity" role="status" aria-live="polite">
              {ready ? (
                <CheckCircle2 size={14} aria-hidden="true" />
              ) : (
                <span className="journey-activity-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {stages[phase].detail}
            </p>
          </div>
        )}
        <footer className="journey-footer">
          <p>次の景色に、会いにいこう。</p>
          <button
            type="button"
            onClick={() => setCreditsOpen(true)}
            aria-label={`写真の出典：${photo.author}`}
          >
            Photo: {photo.author} ↗
          </button>
        </footer>
      </div>
      {stationOpen && (
        <BottomSheet title="駅を出発地にする" onClose={() => setStationOpen(false)}>
          <p className="body-copy">選んだ駅と趣味から、ドライブ先を探します。</p>
          <StationPicker label="探したい駅" value={stationId} onChange={setStationId} />
          <PrimaryButton
            disabled={!railStation(stationId)}
            onClick={() => {
              setStationOpen(false)
              retry(stationId!)
            }}
          >
            この駅から探す
          </PrimaryButton>
        </BottomSheet>
      )}
      {creditsOpen && (
        <BottomSheet title="写真について" onClose={() => setCreditsOpen(false)}>
          <p className="body-copy">
            日本各地の風景です。検索結果や現地の現在の様子を表すものではありません。
          </p>
          <div className="journey-credits">
            {searchJourneyPhotos.map((scene) => (
              <article key={scene.id}>
                <h3>{scene.name}</h3>
                <p>撮影：{scene.author}</p>
                <a href={scene.sourceUrl} target="_blank" rel="noreferrer">
                  写真の出典 ↗
                </a>
                {' · '}
                <a href={scene.licenseUrl} target="_blank" rel="noreferrer">
                  {scene.license}
                </a>
              </article>
            ))}
          </div>
          <p className="small muted">
            写真は画面に合わせてトリミング・拡大表示しています。各写真には表示したライセンスが適用されます。
          </p>
        </BottomSheet>
      )}
    </section>
  )
}
