import { EventDatePicker } from '../components/EventDatePicker'
import { defaultEventSelection, eventDates } from '../domain/eventSearch'
import { useDiscoveryLocation } from '../state/DiscoveryLocationState'
import { LOCATION_REGION } from '../domain/discoveryLocation'
import { driveQuery, driveTheme } from '../domain/driveSearch'
import type { DriveMode } from '../domain/driveSearch'
import { DriveConditions, HobbyChoices } from '../components/DriveSearchControls'
import type { SearchDraft } from '../state/WebSearchState'
import { publicSearchOrigin } from '../domain/publicSearchConfig'
import { ShareCandidateButton } from '../sharing/components'
import { fromOuting } from '../sharing/candidates'
import { ExternalModal } from '../components/ExternalLinkModal'
import { evaluateOuting, outingStateLabels } from '../domain/outingLifecycle'
import { OutingImage, OutingStatus, OutingPhotoCredit } from '../components/OutingStatus'
import { useContent, useContentTime } from '../content/ContentProvider'
import { useId, useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CarFront,
  ChevronDown,
  ExternalLink,
  Heart,
  Link2,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { normalizeSavedUrl, savedUrlKey } from '../domain/savedUrls'
import { resolveDiscoveryRegion } from '../domain/discoveryRegion'
import { stationLabel, stationRegion } from '../domain/railStations'
import { DiscoveryRegionSheet } from '../components/DiscoveryRegionSheet'

import { useApp } from '../state/AppState'
import { OutingConditions } from '../components/TripConditions'

import { ArrivalTeaser } from './Arrival'
import { EventCard } from '../components/Cards'
import { useWebSearch } from '../state/WebSearchState'
import { WebSearchResults } from '../components/WebSearchResults'
import {
  BottomSheet,
  Chip,
  EmptyState,
  Header,
  IconButton,
  InfoRows,
  PrimaryButton,
  SampleNote,
  SectionHeading,
  Tag,
  useBack,
} from '../components/ui'

export function SnsSheet({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useApp()
  const navigate = useNavigate()
  const errorId = useId()
  const [duplicate, setDuplicate] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    try {
      const normalized = normalizeSavedUrl(url)
      if (state.links.some((l) => savedUrlKey(l.url) === normalized.key)) {
        setDuplicate(true)
        setError('この投稿はすでに保存されています。保存済みの内容を確認できます。')
        return
      }
      const { url: clean, source } = normalized
      update((s) => ({
        ...s,
        links: [
          ...s.links,
          {
            id: crypto.randomUUID(),
            url: clean,
            originalUrl: url.trim(),
            title: title.trim() || `${source}で見つけたお出かけ`,
            source,
            addedAt: new Date().toISOString(),
          },
        ],
      }))
      toast('リンクを行きたいに保存しました')
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'URLを確認してください。')
    }
  }
  return (
    <BottomSheet title="SNSで見つけた場所を追加" onClose={onClose}>
      <div className="sns-intro">
        <div className="round-icon">
          <Link2 size={26} />
        </div>
        <p>
          その「行ってみたい」を、
          <br />
          ここに残しておきましょう。
        </p>
      </div>
      <form onSubmit={submit} noValidate>
        <label className="field-label">
          投稿のURL
          <input
            autoFocus
            type="url"
            maxLength={2048}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setDuplicate(false)
              setError('')
            }}
            placeholder="https://www.tiktok.com/..."
            required
          />
        </label>
        <label className="field-label">
          自分用のタイトル <span>任意</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="気になっていた海辺のカフェ"
            maxLength={80}
          />
        </label>
        {error && (
          <p className="field-error" role="alert" id={errorId}>
            {error}
          </p>
        )}
        {duplicate && (
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              onClose()
              navigate('/saved?type=events')
            }}
          >
            保存済みリンクを見る
          </PrimaryButton>
        )}
        <div className="notice">
          「リンクとして保存・内容未確認」で残します。開催日や場所を自動で補完することはありません。
        </div>
        <PrimaryButton type="submit" icon={Plus}>
          行きたいに追加
        </PrimaryButton>
      </form>
    </BottomSheet>
  )
}
export function Discover() {
  const { outings, source } = useContent()
  const now = useContentTime()
  const { state, update } = useApp()
  const web = useWebSearch()
  const gps = useDiscoveryLocation()
  const navigate = useNavigate()
  const resultsRef = useRef<HTMLDivElement>(null)
  const [sns, setSns] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)
  const [hobbiesOpen, setHobbiesOpen] = useState(false)
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [locationIntent, setLocationIntent] = useState<DriveMode>('default')
  const [pending, setPending] = useState<SearchDraft | null>(null)
  const [acquired, setAcquired] = useState(false)
  const samples = state.discover.usageSamples ?? false
  const setSamples = (usageSamples: boolean) =>
    update((s) => ({ ...s, discover: { ...s.discover, usageSamples } }))
  const isEvent = state.discover.category === 'イベント'
  const mode = isEvent ? 'events' : (state.discover.driveMode ?? 'default')
  const selected = gps.enabled
    ? null
    : resolveDiscoveryRegion(
        state.discover.region,
        state.profile.stationId,
        state.discover.stationId,
      )
  const dates = eventDates(state.discover.eventSelection ?? defaultEventSelection, now)
  const region = gps.enabled
    ? gps.fix
      ? LOCATION_REGION
      : null
    : selected
      ? stationRegion(selected)
      : null
  const patch = (value: Partial<typeof state.discover>) =>
    update((s) => ({ ...s, discover: { ...s.discover, ...value } }))
  const requestSearch = (nextMode: DriveMode) => {
    const drive = driveQuery(nextMode, state.driveChoices, state.profile.interests)
    const draft: SearchDraft = {
      drive,
      region,
      stationId: selected?.id,
      location: gps.enabled ? gps.fix?.center : undefined,
      theme: driveTheme(drive, state.discover.search),
      category: nextMode === 'events' ? 'イベント' : 'おすすめ',
      tag: '',
      eventDates: nextMode === 'events' ? dates : undefined,
    }
    if (nextMode === 'free' && !state.discover.search.trim()) {
      patch({ driveMode: 'free' })
      setPending(draft)
      return
    }
    if (!region) {
      setLocationIntent(nextMode)
      setLocationOpen(true)
      return
    }
    patch({ category: draft.category, ...(nextMode !== 'events' ? { driveMode: nextMode } : {}) })
    setSamples(false)
    setPending(draft)
  }
  // Defer until the mount is committed, including React StrictMode's setup/cleanup cycle.
  useEffect(() => {
    const timer = setTimeout(web.startHomeSearch, 0)
    return () => clearTimeout(timer)
  }, [web.startHomeSearch])
  // Manual searches remain separate from the single automatic launch search.
  useEffect(() => {
    if (!pending || web.loading) return
    const expected = pending.drive?.mode
    if (expected !== mode) return
    setPending(null)
    resultsRef.current?.scrollIntoView({ block: 'start' })
    void web.search(pending)
  }, [pending, mode, web.loading])
  useEffect(() => {
    if (!acquired || !gps.fix) return
    setAcquired(false)
    const drive = driveQuery(locationIntent, state.driveChoices, state.profile.interests)
    patch({
      category: locationIntent === 'events' ? 'イベント' : 'おすすめ',
      ...(locationIntent !== 'events' ? { driveMode: locationIntent } : {}),
    })
    setSamples(false)
    setPending({
      drive,
      region: LOCATION_REGION,
      location: gps.fix.center,
      theme: driveTheme(drive, state.discover.search),
      category: locationIntent === 'events' ? 'イベント' : 'おすすめ',
      tag: '',
      eventDates: locationIntent === 'events' ? dates : undefined,
    })
  }, [acquired, gps.fix])
  const sampleOutings = outings.filter(
    (o) => evaluateOuting(o, now).recommendable && !state.hiddenEvents.includes(o.id),
  )
  const searchResults = web.active ? (
    <WebSearchResults />
  ) : (
    <section className="drive-empty" aria-label="おすすめの候補">
      <EmptyState
        icon={CarFront}
        title={
          gps.loading
            ? '現在地を取得しています…'
            : isEvent
              ? '趣味に合うイベントを探そう'
              : region
                ? '行き先を探してみましょう'
                : '出発地を選んで探せます'
        }
        description={
          gps.loading
            ? '位置情報の許可が表示されたら、許可するとおすすめを探します。'
            : isEvent
              ? '下で日付や趣味を選んで検索できます。'
              : '下で出発地や希望を選んで検索できます。'
        }
      />
    </section>
  )
  return (
    <div className="screen discover-screen drive-home">
      <div className="page-pad">
        <div className="drive-home-feed" ref={resultsRef}>
          <h1 className="sr-only">今日は、どこまで走ろう？</h1>
          <div className="chips discovery-chips" aria-label="見つけるの種類">
            {['おすすめ', 'イベント'].map((category) => (
              <Chip
                key={category}
                selected={category === state.discover.category}
                onClick={() => patch({ category })}
              >
                {category}
              </Chip>
            ))}
          </div>
          {searchResults}
        </div>
        <div className="drive-home-controls">
          <Header />
          <div className="discover-title">
            <span className="eyebrow teal">LET'S GO FOR A DRIVE</span>
            <h2>今日は、どこまで走ろう？</h2>
          </div>
          <p className="discover-lead">走る時間も、ふたりの思い出に。</p>
          <section className="drive-origin-card">
            <div>
              <MapPin size={20} />
              <span>
                <small>ドライブの出発地</small>
                <strong>
                  {gps.enabled
                    ? gps.fix
                      ? '取得した現在地'
                      : '現在地を再取得してください'
                    : selected
                      ? stationLabel(selected)
                      : '現在地から行き先を探そう'}
                </strong>
              </span>
            </div>
            <p className="small muted">
              選んだ趣味と出発地から、片道2〜5時間のドライブ先を10件を目安に探します。
            </p>
            <details className="small muted">
              <summary>現在地の使い方</summary>
              <p>
                起動時に一度取得し、約100m単位の位置と趣味をOpenAI・Anthropicに、経路計算のためGoogle
                Mapsに送ります。移動は追跡せず、位置は保存・共有しません。取得から10分間だけメモリ内で利用します。一時的なタブ・アプリの切り替えでは検索を続け、再読み込みや終了で位置を破棄します。
              </p>
            </details>
            {gps.error && !locationOpen && !regionOpen && !web.active && (
              <p className="field-error" role="alert">
                {gps.error}
              </p>
            )}
            <PrimaryButton
              icon={MapPin}
              disabled={web.loading || gps.loading}
              onClick={() => {
                if (region) {
                  requestSearch('default')
                  return
                }
                setLocationIntent('default')
                setLocationOpen(true)
              }}
            >
              {gps.loading
                ? '現在地を取得中…'
                : web.loading
                  ? 'おすすめを探しています…'
                  : region
                    ? 'この出発地からドライブ先を探す'
                    : '現在地からドライブ先を探す'}
            </PrimaryButton>
            <button
              className="text-button"
              aria-label="探す地域を変更"
              data-focus-key="discover-region"
              onClick={() => setRegionOpen(true)}
            >
              出発地を選ぶ・変更する
            </button>
          </section>
          <p className="small muted web-search-hint">
            起動時に現在地と趣味から一度検索します。新しい実検索にはAPI料金がかかります。
          </p>
          {publicSearchOrigin && (
            <p className="small muted drive-search-access">
              AI検索はログイン・参加コードが必要です。
              <button className="text-button" onClick={() => navigate('/search/access')}>
                AI検索の参加・ログイン
              </button>
            </p>
          )}
          {!isEvent && mode === 'default' && (
            <section className="drive-home-hobbies" aria-label="おすすめに使う趣味">
              <p className="body-copy">
                {state.profile.interests.length
                  ? `${state.profile.interests.join('・')}が好きなあなたへ。`
                  : '趣味は未選択です。ジャンルを限定せず、ドライブ先を探します。'}
              </p>
              <button className="text-button" onClick={() => setHobbiesOpen(true)}>
                趣味を変更する
              </button>
            </section>
          )}
          {isEvent ? (
            <section className="drive-event-search">
              <h2>趣味から見つかるイベント</h2>
              <p className="body-copy">
                {state.profile.interests.length
                  ? `${state.profile.interests.join('・')}が好きなあなたへ。`
                  : '趣味を選ぶと、気になるイベントを探しやすくなります。未選択ならジャンルを限定しません。'}
              </p>
              <button className="text-button" onClick={() => setHobbiesOpen(true)}>
                趣味を変更する
              </button>
              <EventDatePicker
                value={state.discover.eventSelection ?? defaultEventSelection}
                now={now}
                onChange={(eventSelection) => patch({ eventSelection })}
              />
              <PrimaryButton
                icon={Search}
                disabled={web.loading}
                onClick={() => requestSearch('events')}
              >
                趣味のイベントを探す
              </PrimaryButton>
              <p className="small muted">
                出発地・趣味・日付で10件を目安に探します。自由入力や気分の条件は使いません。
              </p>
            </section>
          ) : (
            <>
              <form
                className="drive-free-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  requestSearch('free')
                }}
              >
                <label className="field-label">
                  気になる場所や、したいこと
                  <textarea
                    aria-label="お出かけを検索"
                    value={state.discover.search}
                    maxLength={80}
                    placeholder="海を眺めながら走って、おいしい海鮮を食べたい"
                    onChange={(e) => patch({ search: e.target.value })}
                  />
                </label>
                <p className="small muted">
                  思いついたことを自由に。片道2〜5時間を目安に探します（80文字まで）。
                </p>
                <PrimaryButton type="submit" icon={Search} disabled={web.loading}>
                  この希望で探す
                </PrimaryButton>
              </form>
              <section className="drive-mood-section">
                <button
                  className="condition-edit-button"
                  aria-expanded={conditionsOpen}
                  onClick={() => setConditionsOpen((v) => !v)}
                >
                  <SlidersHorizontal size={20} />
                  <span>
                    <strong>気分からドライブを探す</strong>
                    <small>行き先が決まっていないときに</small>
                  </span>
                  <ChevronDown size={18} />
                </button>
                {conditionsOpen && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      requestSearch('conditions')
                    }}
                  >
                    <DriveConditions
                      value={state.driveChoices}
                      onChange={(driveChoices) => update((s) => ({ ...s, driveChoices }))}
                    />
                    <PrimaryButton type="submit" icon={Search} disabled={web.loading}>
                      選んだ条件で探す
                    </PrimaryButton>
                    <p className="small muted">
                      上の自由入力とは別の検索です。ここで選んだ条件だけを使います。
                    </p>
                  </form>
                )}
              </section>
              <div className="chips wrap drive-results-switch" aria-label="表示する検索結果">
                {(
                  [
                    ['default', 'ドライブデート'],
                    ['free', '自由入力の結果'],
                    ['conditions', '条件の結果'],
                  ] as const
                ).map(([driveMode, label]) => (
                  <Chip
                    key={driveMode}
                    selected={mode === driveMode}
                    onClick={() => {
                      patch({ driveMode })
                      setSamples(false)
                    }}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </div>
        {source === 'sample' && !web.active && (
          <>
            <button className="text-button centered" onClick={() => setSamples(!samples)}>
              {samples ? '操作用サンプルを閉じる' : '操作用サンプルを見る'}
            </button>
            {samples && (
              <>
                <SampleNote>
                  操作確認用の既存サンプルです。現在地からの検索結果ではありません。
                </SampleNote>
                <div className="event-list">
                  {sampleOutings.map((o) => (
                    <EventCard key={o.id} outing={o} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <button className="sns-banner" onClick={() => setSns(true)}>
          <span className="sns-banner-icon">
            <Link2 size={21} />
          </span>
          <span>
            <strong>SNSで見つけた「行きたい」も。</strong>
            <small>リンクを貼って、楽しみをひとつ追加</small>
          </span>
          <Plus size={18} />
        </button>
        <button className="car-banner" onClick={() => navigate('/cars')}>
          <CarFront size={31} />
          <span>
            <strong>ドライブの車を探す</strong>
            <small>レンタカー・カーシェアの場所を確認</small>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
      {sns && <SnsSheet onClose={() => setSns(false)} />}
      {hobbiesOpen && (
        <BottomSheet title="趣味を変更する" onClose={() => setHobbiesOpen(false)}>
          <HobbyChoices
            value={state.profile.interests}
            onChange={(values) =>
              update((s) => ({ ...s, profile: { ...s.profile, interests: values } }))
            }
          />
          <PrimaryButton onClick={() => setHobbiesOpen(false)}>この趣味にする</PrimaryButton>
        </BottomSheet>
      )}
      {regionOpen && (
        <DiscoveryRegionSheet
          value={state.discover.region}
          originId={state.profile.stationId}
          stationId={state.discover.stationId}
          onSave={(region, stationId) => patch({ region, stationId })}
          onClose={() => setRegionOpen(false)}
        />
      )}
      {locationOpen && (
        <BottomSheet
          title="現在地からドライブ先を探す"
          onClose={() => {
            gps.cancel()
            setLocationOpen(false)
            setAcquired(false)
          }}
        >
          <p className="body-copy">
            現在地を一度取得し、その地点からドライブ先を探します。許可したあとに検索を1回実行し、候補をホームに表示します。
          </p>
          {(locationIntent === 'default' || locationIntent === 'events') && (
            <p className="body-copy">
              {state.profile.interests.length
                ? `検索に使う趣味：${state.profile.interests.join('・')}`
                : '趣味は未選択のため、ジャンルを限定せずに探します。'}
            </p>
          )}
          <p className="small muted">
            約100m単位に丸めた位置と検索条件をOpenAI・Anthropicへ、経路計算が有効な場合はGoogle
            Mapsへ送ります。位置は端末・検索履歴・共有リストに保存せず、移動を追跡しません。取得から10分間だけメモリ内で利用します。一時的なタブ・アプリの切り替えでは検索を続け、再読み込みや終了で位置を破棄します。
          </p>
          <p className="small muted">新しい実検索にはAPI料金がかかります。</p>
          {gps.error && (
            <p className="field-error" role="alert">
              {gps.error}
            </p>
          )}
          <PrimaryButton
            icon={MapPin}
            disabled={gps.loading || web.loading}
            onClick={async () => {
              if (await gps.locate()) {
                setLocationOpen(false)
                setAcquired(true)
              }
            }}
          >
            {gps.loading ? '現在地を取得中…' : '現在地を取得して検索'}
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              gps.cancel()
              setLocationOpen(false)
              setRegionOpen(true)
            }}
          >
            現在地を使わず、駅から探す
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
export function EventDetail() {
  const { outings, source } = useContent()
  const now = useContentTime()
  const { id } = useParams()
  const outing = outings.find((o) => o.id === id)
  const navigate = useNavigate()
  const back = useBack()
  const location = useLocation()
  const { state, update, toggleEvent, toast } = useApp()
  const [external, setExternal] = useState<'official' | 'map' | 'sns' | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const saved = state.savedEvents.includes(id ?? '')
  if (!outing)
    return (
      <>
        <Header back title="お出かけ" />
        <EmptyState
          title="お出かけが見つかりません"
          description="一覧から、別のお出かけを探せます。"
          action="見つけるに戻る"
          onAction={() => navigate('/discover')}
        />
      </>
    )
  const status = evaluateOuting(outing, now)
  if (status.state === 'withdrawn')
    return (
      <div className="screen">
        <Header back title="お出かけ" />
        <div className="page-pad">
          <h1>このお出かけは掲載停止中です</h1>
          <OutingStatus outing={outing} detail />
          <p className="body-copy">以前の紹介・写真・アクセス情報は表示していません。</p>
          {saved && (
            <PrimaryButton variant="secondary" onClick={() => toggleEvent(outing.id)}>
              行きたいから外す
            </PrimaryButton>
          )}
          <PrimaryButton onClick={() => navigate('/discover')}>ほかのお出かけを探す</PrimaryButton>
        </div>
      </div>
    )
  const goal = state.goals[outing.id] ?? { companion: state.profile.companion, when: '', note: '' }
  const setGoal = (patch: Partial<typeof goal>) =>
    update((s) => ({ ...s, goals: { ...s.goals, [outing.id]: { ...goal, ...patch } } }))
  return (
    <div className="screen event-detail">
      <div className="detail-hero">
        <OutingImage outing={outing} />
        <div className="detail-hero-shade" />
        <div className="detail-hero-actions">
          <IconButton icon={ArrowLeft} label="戻る" onClick={back} />
          <div>
            <IconButton
              icon={Heart}
              label={saved ? '行きたいから外す' : '行きたいに保存'}
              className={saved ? 'heart-active' : ''}
              aria-pressed={saved}
              onClick={() => toggleEvent(outing.id)}
            />
            <IconButton
              icon={MoreHorizontal}
              label="情報源を確認"
              onClick={() => setExternal('official')}
            />
          </div>
        </div>
        <span className="hero-label">{outing.mood}</span>
      </div>
      <div className="detail-body page-pad">
        <OutingPhotoCredit outing={outing} />
        <div className="tags">
          {outing.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          <Tag tone="neutral">サンプル</Tag>
        </div>
        <h1>{outing.title}</h1>
        <p className="detail-subtitle">{outing.subtitle}</p>
        <OutingStatus outing={outing} detail />
        <div className="detail-meta">
          <p>
            <MapPin size={15} />
            {outing.area}
          </p>
          <p>
            <CalendarDays size={15} />
            {status.dateLabel}
          </p>
        </div>
        <p className="body-copy">{outing.description}</p>
        <PrimaryButton
          icon={Heart}
          variant={saved ? 'secondary' : 'primary'}
          onClick={() => toggleEvent(outing.id)}
        >
          {saved ? '行きたいに保存済み' : '行きたいに保存'}
        </PrimaryButton>
        <ShareCandidateButton candidate={fromOuting(outing, now)} />
        <button className="text-button goal-link" onClick={() => setGoalOpen(true)}>
          <Plus size={15} />
          誰と・いつ・何をしたいかをメモ
        </button>
        <div className="divider" />
        <SectionHeading
          title="このお出かけに向けて"
          subtitle="楽しみが見つかったら、あなたのペースで。"
        />
        <div className="preparation-card">
          <span className="round-icon">
            <BookSymbol />
          </span>
          <div>
            <h3>運転の準備を、ひとつずつ。</h3>
            <p>
              知識や気になることを整理して、
              <br />
              学習や練習前の準備につなげます。
            </p>
          </div>
        </div>
        <PrimaryButton
          icon={ArrowRight}
          onClick={() => {
            update((s) => ({ ...s, memo: { ...s.memo, goal: goal.note || outing.title } }))
            navigate('/check', {
              state: { outingId: outing.id, tab: location.state?.tab || 'discover' },
            })
          }}
        >
          運転の準備を確認
        </PrimaryButton>
        <PrimaryButton
          icon={CarFront}
          variant="secondary"
          onClick={() => {
            update((s) => ({
              ...s,
              map: { ...s.map, area: s.profile.area, query: '', selected: null },
            }))
            navigate('/cars')
          }}
        >
          出発地で車を探す
        </PrimaryButton>
        <button className="text-button centered" onClick={() => navigate('/learn')}>
          チェックをせずに学ぶ <ArrowRight size={14} />
        </button>
        <div className="divider" />
        <ArrivalTeaser outingId={outing.id} />
        <OutingConditions outingId={outing.id} />
        <SectionHeading title="お出かけの基本情報" />
        <InfoRows
          rows={[
            ['開催状態', `${outingStateLabels[status.state]}（サンプル）`],
            ['日時・期間', status.dateLabel],
            ['開催地', outing.area],
            ['料金', outing.price],
            ['参加・予約条件', '未確認'],
            ['主催者・施設', 'サンプルのため未確認'],
            ['駐車場・車での所要時間', '要確認'],
            ['発見元', `${outing.source}（サンプル）`],
            [
              '情報確認日',
              status.checkedAt ? `${status.checkedAt}（架空の確認記録）` : '再確認が必要です',
            ],
          ]}
        />
        <PrimaryButton
          variant="secondary"
          icon={ExternalLink}
          onClick={() => setExternal('official')}
        >
          公式情報を見る
        </PrimaryButton>
        <PrimaryButton variant="secondary" icon={MapPin} onClick={() => setExternal('map')}>
          地図・アクセスを確認
        </PrimaryButton>
        {['X', 'TikTok'].includes(outing.source) && (
          <PrimaryButton variant="ghost" icon={Link2} onClick={() => setExternal('sns')}>
            関連SNS投稿を見る
          </PrimaryButton>
        )}
        <SampleNote />
      </div>
      {external && (
        <ExternalModal
          title={outing.title}
          kind={external}
          request={{
            type: 'listing',
            catalogSource: source,
            kind: external,
            links: outing.links,
            stopped: outing.lifecycle?.availability === 'withdrawn',
          }}
          onClose={() => setExternal(null)}
        />
      )}
      {goalOpen && (
        <BottomSheet title="このお出かけのメモ" onClose={() => setGoalOpen(false)}>
          <label className="field-label">
            誰と行きたい？
            <input
              value={goal.companion}
              onChange={(e) => setGoal({ companion: e.target.value })}
              placeholder="恋人・パートナー"
            />
          </label>
          <label className="field-label">
            いつ頃？
            <input
              value={goal.when}
              onChange={(e) => setGoal({ when: e.target.value })}
              placeholder="10月の週末"
            />
          </label>
          <label className="field-label">
            実現したいこと
            <textarea
              value={goal.note}
              onChange={(e) => setGoal({ note: e.target.value })}
              placeholder="湖のそばで、のんびり過ごしたい"
            />
          </label>
          <PrimaryButton
            onClick={() => {
              if (!saved) update((s) => ({ ...s, savedEvents: [...s.savedEvents, outing.id] }))
              toast('お出かけのメモを保存しました')
              setGoalOpen(false)
            }}
          >
            メモを保存
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
function BookSymbol() {
  return <Sparkles size={24} strokeWidth={1.5} />
}
