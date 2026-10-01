import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CarFront,
  ChevronRight,
  ExternalLink,
  Heart,
  Info,
  List,
  LocateFixed,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { Browser } from '@capacitor/browser'
import { isNativeApp } from '../platform/runtime'
import { useApp } from '../state/AppState'
import {
  BottomSheet,
  Chip,
  EmptyState,
  Header,
  IconButton,
  InfoRows,
  PrimaryButton,
  Tag,
  useBack,
} from '../components/ui'
const RealRentalMap = lazy(() =>
  import('../components/RealRentalMap').then((module) => ({ default: module.RealRentalMap })),
)
import leafletLicense from '../data/leaflet-license.txt?raw'
import { ExternalModal } from '../components/ExternalLinkModal'
import type { ExternalRequest } from '../domain/externalLinks'
import {
  createRealMapState,
  filterRealStations,
  searchStationArea,
  nationalBounds,
  stationSnapshot,
  realStations,
  stationRegions,
  stationLicense,
} from '../domain/realStations'
import type { Bounds, RealMapState, RealStation } from '../domain/realStations'
import { mapTileCache } from '../domain/mapTiles'
import vectorLicense from '../data/vector-tile-licenses.txt?raw'
import { useLocationSearch } from '../state/LocationSearchState'
import { distanceMetres, nearbyStations, nearbyBounds } from '../domain/nearbyStations'
import type { LocationFix } from '../domain/nearbyStations'

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { toast } = useApp()
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!isNativeApp) return
        e.preventDefault()
        void Browser.open({ url: href }).catch(() =>
          toast('ブラウザを開けませんでした。通信状態を確認してください。'),
        )
      }}
    >
      {children}
    </a>
  )
}
export function MapCredits() {
  return (
    <div className="real-map-credits">
      地図：
      <SourceLink href="https://github.com/gsi-cyberjapan/gsimaps-vector-experiment">
        国土地理院ベクトルタイル提供実験
      </SourceLink>
      （加工） · 拠点：©{' '}
      <SourceLink href="https://www.openstreetmap.org/copyright">
        OpenStreetMap contributors
      </SourceLink>{' '}
      （ODbL）
    </div>
  )
}
export function RealStationCard({
  station,
  onClick,
  origin,
}: {
  station: RealStation
  onClick: () => void
  origin?: LocationFix
}) {
  const { state, toggleStation, storageProtected } = useApp()
  const saved = state.savedStations.includes(station.id)
  return (
    <article className="real-station-card">
      <button
        className="real-station-main"
        onClick={onClick}
        data-focus-key={`real-station:${station.id}`}
      >
        <span className={`real-car-icon ${station.type === 'レンタカー' ? 'rental' : ''}`}>
          <CarFront size={23} />
        </span>
        <span>
          <Tag>{station.type}</Tag>
          <strong>{station.name}</strong>
          <small>OSM掲載情報 · 営業状況は未確認</small>
          {origin && (
            <small>
              取得した位置から直線約
              {(
                distanceMetres(origin, { lat: station.latitude, lng: station.longitude }) / 1000
              ).toFixed(1)}
              km
            </small>
          )}
        </span>
        <ChevronRight size={16} />
      </button>
      <IconButton
        icon={Heart}
        label={`${station.name}を${saved ? '保存解除' : '保存'}`}
        className={saved ? 'heart-active' : ''}
        disabled={storageProtected}
        onClick={() => toggleStation(station.id)}
      />
    </article>
  )
}
function StationFacts({ station }: { station: RealStation }) {
  return (
    <>
      <p className="body-copy">
        公開地図に登録された名称と位置です。現在の営業状況、正確な車の入口は事業者に確認してください。
      </p>
      <InfoRows
        rows={[
          ['所在地', `${station.locality}・公開地図上の位置（住所未確認）`],
          ['営業時間・入出庫', '未確認 · 公式で確認'],
          ['登録・返却・車両条件', '未確認 · 公式で確認'],
          ['空き状況・料金', '取得していません'],
          ['データ取得日', station.retrievedAt],
          ['運営による確認日', '未確認'],
        ]}
      />
    </>
  )
}
export function RealCars() {
  const { update } = useApp()
  const navigate = useNavigate()
  const location = useLocationSearch()
  const { map, patch, session, cancel } = location
  const filtered = useMemo(
    () => (session?.nearby ? nearbyStations(map, session.point) : filterRealStations(map)),
    [map, session],
  )
  useEffect(() => () => cancel(), [cancel])
  const [fit, setFit] = useState<{ bounds: Bounds; key: number } | null>(null)
  // Fit the 2 km area only after a new fix, not when returning from detail.
  const lastLocationKey = useRef(session?.key)
  useEffect(() => {
    if (session?.key !== lastLocationKey.current) {
      lastLocationKey.current = session?.key
      if (session) setFit({ bounds: nearbyBounds(session.point), key: session.key })
    }
  }, [session])
  const visibleBounds = useRef<Bounds>(map.bounds)
  const [moved, setMoved] = useState(false)
  const [sheet, setSheet] = useState<'filters' | 'station' | 'location' | null>(null)
  const [draftProviders, setDraftProviders] = useState(map.providers)
  const [draftType, setDraftType] = useState(map.type)
  const [providerQuery, setProviderQuery] = useState('')
  const [providerLimit, setProviderLimit] = useState(40)
  const [listLimit, setListLimit] = useState(50)
  const [cluster, setCluster] = useState<RealStation[] | null>(null)
  useEffect(() => {
    setListLimit(50)
  }, [filtered])
  const selected = filtered.find((station) => station.id === map.selected)
  const preview = selected || filtered[0]
  const providers = [
    ...new Set([
      ...(session?.nearby
        ? nearbyStations({ ...map, providers: [], type: 'すべて' }, session.point)
        : filterRealStations({ ...map, providers: [], type: 'すべて' })
      ).map((station) => station.provider),
      ...map.providers,
    ]),
  ].sort((a, b) => {
    const common = [
      'タイムズカー',
      'トヨタレンタカー',
      'ニッポンレンタカー',
      'オリックスレンタカー',
      '日産レンタカー',
    ]
    return (
      (common.includes(a) ? common.indexOf(a) : 99) -
        (common.includes(b) ? common.indexOf(b) : 99) || a.localeCompare(b, 'ja')
    )
  })
  const visibleProviders = providers.filter((name) =>
    name.toLowerCase().includes(providerQuery.toLowerCase()),
  )
  const select = (station: RealStation) => {
    patch({ selected: station.id })
    setSheet('station')
  }
  const search = (query = map.query) => {
    location.reset()
    const manualPatch = (values: Partial<RealMapState>) =>
      update((s) => ({ ...s, realMap: { ...s.realMap, ...values } }))
    const area = searchStationArea(query || '全国')
    if (!area) {
      manualPatch({ query, unsupported: true, appliedArea: query.trim(), selected: null })
      return
    }
    manualPatch({
      query: area.name,
      appliedArea: area.name,
      unsupported: false,
      bounds: area.bounds,
      selected: null,
    })
    setFit({ bounds: area.bounds, key: Date.now() })
    setMoved(false)
  }
  const externalSearch = () => {
    update((s) => ({
      ...s,
      carSearch: {
        ...s.carSearch,
        area: session ? '' : map.query.trim() || map.appliedArea,
        type: map.type,
        provider: null,
      },
    }))
    navigate('/cars/search')
  }
  const empty = (
    <div className="real-map-empty" role="status">
      <strong>
        {map.unsupported
          ? 'この地名・拠点名は見つかりませんでした'
          : 'この条件の掲載拠点はありません'}
      </strong>
      <p>
        公開地図には未登録・情報が古い拠点もあります。周辺に店舗がないという意味ではありません。地名が見つからない場合は、現在地または地図を動かして探せます。
      </p>
      <button
        className="text-button"
        onClick={() => {
          location.reset()
          update((s) => ({
            ...s,
            realMap: {
              ...createRealMapState(),
              mode: map.mode,
              bounds: nationalBounds,
              query: '全国',
              appliedArea: '全国',
            },
          }))
          setFit({ bounds: nationalBounds, key: Date.now() })
        }}
      >
        全国の掲載拠点を表示
      </button>
    </div>
  )
  return (
    <div className={`real-cars-screen ${map.mode === 'list' ? 'real-cars-list' : ''}`}>
      <h1 className="sr-only">{map.mode === 'map' ? '車を探す・実地図' : '借りる場所を探す'}</h1>
      <div className="real-map-header">
        <form
          className="map-search"
          onSubmit={(e) => {
            e.preventDefault()
            search()
            ;(document.activeElement as HTMLElement)?.blur()
          }}
        >
          <Search size={18} />
          <input
            aria-label="駅名・地域から車を探す"
            placeholder="浜松町・札幌・拠点名など"
            value={map.query}
            maxLength={80}
            onChange={(e) => patch({ query: e.target.value })}
          />
          <IconButton icon={Search} label="地域を検索" type="submit" />
          <IconButton
            icon={UserRound}
            label="マイページを開く"
            className="profile-button"
            onClick={() => navigate('/profile', { state: { tab: 'cars' } })}
          />
        </form>
        <div className="chips real-type-chips">
          {(['すべて', 'レンタカー', 'カーシェア'] as const).map((type) => (
            <Chip
              key={type}
              selected={map.type === type}
              onClick={() => patch({ type, selected: null })}
            >
              {type}
            </Chip>
          ))}
          <IconButton
            icon={SlidersHorizontal}
            label="車の事業者フィルター"
            className={map.providers.length ? 'has-filter' : ''}
            onClick={() => {
              setProviderQuery('')
              setProviderLimit(40)
              setDraftProviders(map.providers)
              setDraftType(map.type)
              setSheet('filters')
            }}
          />
        </div>
        <div className="real-region-chips" aria-label="地域のショートカット">
          {[
            '浜松町',
            '全国',
            '京都中心部',
            '新宿・中野',
            '大阪・梅田',
            '滋賀・草津',
            '札幌',
            '仙台',
            '名古屋',
            '広島',
            '福岡・博多',
            '那覇',
          ].map((name) => (
            <button
              key={name}
              className={map.appliedArea === name ? 'active' : ''}
              onClick={() => search(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="real-map-heading">
          <span>
            <MapPin size={13} />
            {map.appliedArea || '京都中心部'} · {filtered.length}件
          </span>
          <button className="text-button" onClick={() => navigate('/cars/sources')}>
            <Info size={13} /> 出典・掲載範囲
          </button>
        </div>
      </div>
      {map.mode === 'map' ? (
        <>
          <div className="real-map-area">
            <Suspense
              fallback={
                <p className="real-map-loading" role="status">
                  地図を準備しています…
                </p>
              }
            >
              <RealRentalMap
                key={session?.key ?? 'manual'}
                location={session?.point}
                stations={filtered}
                selected={map.selected}
                view={map}
                fit={fit}
                onSelect={select}
                onCluster={(stations) => {
                  setListLimit(50)
                  setCluster(stations)
                }}
                onFitComplete={() => {
                  setFit(null)
                  setMoved(false)
                }}
                onMove={(view, bounds) => {
                  visibleBounds.current = bounds
                  if (
                    Math.abs(view.center.lat - map.center.lat) > 0.00001 ||
                    Math.abs(view.center.lng - map.center.lng) > 0.00001 ||
                    view.zoom !== map.zoom
                  ) {
                    patch(view)
                    setMoved(true)
                  }
                }}
              />
            </Suspense>
            <button
              className="real-search-area"
              onClick={() => {
                location.useViewport()
                patch({
                  bounds: visibleBounds.current,
                  query: '',
                  appliedArea: '表示中の地図範囲',
                  unsupported: false,
                  selected: null,
                })
                setMoved(false)
              }}
            >
              <Search size={13} /> {moved ? '移動したエリアで検索' : 'このエリアで検索'}
            </button>
            <button
              className="real-locate"
              aria-label="現在地から探す"
              onClick={() => setSheet('location')}
            >
              <LocateFixed size={22} />
            </button>
            <span className="real-map-pilot">
              {session
                ? `取得時の位置 · 誤差の目安${Math.ceil(session.point.accuracy)}m`
                : '全国のOSM登録拠点 · 未登録・営業状況は未確認'}
            </span>
          </div>
          <MapCredits />
          <div className="real-map-preview">
            <span className="sheet-handle" />
            <div className="real-preview-heading">
              <h2>{session?.nearby ? '近くの候補・直線距離順' : '借りる場所の候補'}</h2>
              <button className="text-button" onClick={() => patch({ mode: 'list' })}>
                <List size={16} /> 一覧で見る
              </button>
            </div>
            {preview ? (
              <RealStationCard
                station={preview}
                origin={session?.point}
                onClick={() => select(preview)}
              />
            ) : (
              empty
            )}
            <button className="real-external-entry" onClick={externalSearch}>
              掲載外の地域・拠点を探す <ExternalLink size={13} />
            </button>
          </div>
        </>
      ) : (
        <div className="page-pad real-list-content">
          <PrimaryButton variant="secondary" icon={Map} onClick={() => patch({ mode: 'map' })}>
            地図で見る
          </PrimaryButton>
          <button className="text-button location-list-button" onClick={() => setSheet('location')}>
            <LocateFixed size={17} />
            現在地から探す
          </button>
          {session && (
            <p className="small muted">
              取得時の位置から{session.nearby ? '約2km以内・直線距離順。' : 'の直線距離です。'}{' '}
              誤差の目安{Math.ceil(session.point.accuracy)}m。移動後は再取得してください。
            </p>
          )}
          <p className="small muted">
            名称・位置は公開データです。空き状況・料金・営業状況は公式で確認してください。
          </p>
          <p className="small muted" role="status">
            {filtered.length}件中 {Math.min(listLimit, filtered.length)}件を表示
          </p>
          <div className="station-list">
            {filtered.slice(0, listLimit).map((station) => (
              <RealStationCard
                key={station.id}
                station={station}
                origin={session?.point}
                onClick={() => {
                  patch({ selected: station.id })
                  navigate(`/cars/places/${station.id}`)
                }}
              />
            ))}
          </div>
          {filtered.length > listLimit && (
            <PrimaryButton variant="secondary" onClick={() => setListLimit((count) => count + 50)}>
              さらに50件を表示
            </PrimaryButton>
          )}
          {!filtered.length && empty}
          <PrimaryButton variant="secondary" icon={ExternalLink} onClick={externalSearch}>
            掲載外の地域・拠点を探す
          </PrimaryButton>
          <MapCredits />
        </div>
      )}
      {cluster && (
        <BottomSheet title="重なっている拠点" onClose={() => setCluster(null)}>
          <p className="small muted">
            {cluster.length}件。公開地図で同じ場所に登録されている場合もあります。
          </p>
          {cluster.slice(0, listLimit).map((station) => (
            <RealStationCard
              key={station.id}
              station={station}
              onClick={() => {
                setCluster(null)
                navigate(`/cars/places/${station.id}`)
              }}
            />
          ))}
          {cluster.length > listLimit && (
            <PrimaryButton variant="secondary" onClick={() => setListLimit((count) => count + 50)}>
              さらに50件を表示
            </PrimaryButton>
          )}
        </BottomSheet>
      )}
      {sheet === 'location' && (
        <BottomSheet
          title="現在地から周辺を探す"
          onClose={() => {
            cancel()
            setSheet(null)
          }}
        >
          <p className="body-copy">
            許可したときだけ一度取得し、約2km以内の掲載拠点を探します。全国の公開地図の登録情報を使います。未登録の拠点もあり、すべての店舗を網羅していません。
          </p>
          <p className="small muted">
            現在地は保存・共有せず、移動を追跡しません。地図の配信元には表示する区画とIPアドレス等が伝わり、閲覧地域を推測できます。
          </p>
          {location.error && (
            <p className="location-error" role="alert">
              {location.error}
            </p>
          )}
          {location.loading && <p role="status">位置情報を取得しています…</p>}
          <PrimaryButton
            icon={LocateFixed}
            disabled={location.loading}
            onClick={async () => {
              setFit(null)
              if (await location.locate()) {
                setMoved(false)
                setSheet(null)
              }
            }}
          >
            {location.loading ? '取得中…' : '現在地を取得'}
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              location.reset()
              setSheet(null)
              setFit(null)
            }}
          >
            地域名から探す
          </PrimaryButton>
          <p className="small muted">
            アプリを閉じる・再起動する・10分経過すると位置表示を終了します。近さは直線距離の目安で、営業状況や空き状況は未確認です。
          </p>
        </BottomSheet>
      )}
      {sheet === 'station' && selected && (
        <BottomSheet title="この拠点について" onClose={() => setSheet(null)}>
          <Tag>{selected.type}</Tag>
          <h3 className="real-station-title">{selected.name}</h3>
          <StationFacts station={selected} />
          <PrimaryButton
            onClick={() => {
              setSheet(null)
              navigate(`/cars/places/${selected.id}`)
            }}
          >
            拠点の詳細・保存へ
          </PrimaryButton>
        </BottomSheet>
      )}
      {sheet === 'filters' && (
        <BottomSheet title="車の絞り込み" onClose={() => setSheet(null)}>
          <p className="body-copy">
            全国の取得済みデータから、地図の検索範囲にある拠点を表示します。
          </p>
          <h3>サービスの種類</h3>
          <div className="chips">
            {(['すべて', 'レンタカー', 'カーシェア'] as const).map((type) => (
              <Chip key={type} selected={draftType === type} onClick={() => setDraftType(type)}>
                {type}
              </Chip>
            ))}
          </div>
          <h3 className="real-filter-title">事業者</h3>
          <label className="real-provider-search">
            事業者名で絞る
            <input
              value={providerQuery}
              onChange={(e) => {
                setProviderQuery(e.target.value)
                setProviderLimit(40)
              }}
              placeholder="例：トヨタ"
            />
          </label>
          <p className="small muted">
            {draftProviders.length
              ? `${draftProviders.length}事業者を選択中`
              : '指定なし（すべて）'}
          </p>
          <div className="real-provider-options">
            {visibleProviders.slice(0, providerLimit).map((provider) => (
              <label key={provider}>
                <input
                  type="checkbox"
                  checked={draftProviders.includes(provider)}
                  onChange={() =>
                    setDraftProviders((list) =>
                      list.includes(provider)
                        ? list.filter((item) => item !== provider)
                        : [...list, provider],
                    )
                  }
                />
                <span>{provider}</span>
              </label>
            ))}
          </div>
          {visibleProviders.length > providerLimit && (
            <button className="text-button" onClick={() => setProviderLimit((count) => count + 40)}>
              事業者をさらに表示
            </button>
          )}
          {!visibleProviders.length && (
            <p className="small muted">該当する事業者名はありません。</p>
          )}
          <PrimaryButton
            onClick={() => {
              patch({ type: draftType, providers: draftProviders, selected: null })
              setSheet(null)
            }}
          >
            この条件で表示
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              setDraftType('すべて')
              setDraftProviders([])
            }}
          >
            条件をリセット
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
export function RealStationDetail() {
  const { id } = useParams()
  const station = realStations.find((item) => item.id === id)
  const { state, toggleStation, storageProtected } = useApp()
  const navigate = useNavigate()
  const back = useBack('/cars')
  const [request, setRequest] = useState<ExternalRequest | null>(null)
  if (!station)
    return (
      <>
        <Header back={back} />
        <EmptyState
          title="掲載データが見つかりません"
          description="掲載内容が更新された可能性があります。地図から探し直してください。"
          action="車を探すへ"
          onAction={() => navigate('/cars')}
        />
      </>
    )
  const saved = state.savedStations.includes(station.id)
  return (
    <div className="screen">
      <Header back={back} title="拠点の詳細" />
      <div className="page-pad real-station-detail">
        <div className="chips">
          <Tag>{station.type}</Tag>
          <Tag tone="peach">営業状況は未確認</Tag>
        </div>
        <h1>{station.name}</h1>
        <div className="real-station-illustration">
          <CarFront size={68} strokeWidth={1.2} />
          <span>公開地図に登録された拠点</span>
        </div>
        <StationFacts station={station} />
        <PrimaryButton
          icon={Heart}
          variant="secondary"
          disabled={storageProtected}
          onClick={() => toggleStation(station.id)}
        >
          {saved ? '車候補から外す' : '車候補に保存'}
        </PrimaryButton>
        {station.officialSearchProvider ? (
          <PrimaryButton
            icon={ExternalLink}
            onClick={() =>
              setRequest({
                type: 'car-search',
                target: 'provider',
                provider: station.officialSearchProvider!,
              })
            }
          >
            公式で空き状況・予約を確認
          </PrimaryButton>
        ) : (
          <PrimaryButton icon={Search} onClick={() => navigate('/cars/search')}>
            外部の検索で事業者を探す
          </PrimaryButton>
        )}
        <p className="small muted">
          公式ボタンは事業者の検索ページを開きます。この拠点の営業・掲載を確認したものではありません。
        </p>
        <PrimaryButton
          variant="secondary"
          icon={MapPin}
          onClick={() => setRequest({ type: 'station-snapshot', id: station.id, target: 'map' })}
        >
          外部地図で位置を確認
        </PrimaryButton>
        <p className="small muted">駐車場や車の入口とは異なる場合があります。</p>
        <section className="real-source-card">
          <h2>情報の出典</h2>
          <p>
            OpenStreetMapの名称・位置を掲載しています。情報が古い場合や、未登録の拠点があります。
          </p>
          <button
            className="text-button"
            onClick={() =>
              setRequest({ type: 'station-snapshot', id: station.id, target: 'source' })
            }
          >
            この拠点の出典を開く <ExternalLink size={14} />
          </button>
          <details>
            <summary tabIndex={0}>元データの記載を見る</summary>
            <p>
              位置：{station.latitude}, {station.longitude}
            </p>
            <p>営業時間の元表記：{station.sourceHours ?? '記載なし'}（現状未確認）</p>
            <p>
              投稿データの確認日：{station.sourceCheckDate ?? '記載なし'}
              （運営の確認日ではありません）
            </p>
          </details>
          <button className="text-button" onClick={() => navigate('/cars/sources')}>
            取得範囲・利用条件を見る
          </button>
        </section>
        <MapCredits />
      </div>
      {request && (
        <ExternalModal title={station.name} request={request} onClose={() => setRequest(null)} />
      )}
    </div>
  )
}
export function CarMapSources() {
  const back = useBack('/cars')
  const navigate = useNavigate()
  const [rawOpen, setRawOpen] = useState(false)
  const [derivedOpen, setDerivedOpen] = useState(false)
  const metrics = useSyncExternalStore(mapTileCache.subscribe, mapTileCache.snapshot)
  return (
    <div className="screen">
      <Header back={back} title="地図・拠点の情報" />
      <div className="page-pad real-map-sources">
        <p className="eyebrow teal">JAPAN · OPEN MAP DATA</p>
        <h1>
          場所を知って、
          <br />
          公式で確かめる。
        </h1>
        <section>
          <h2>全国の公開地図に登録された拠点</h2>
          <p>
            全国のOpenStreetMap登録から取得した拠点を表示しています。すべての事業者・店舗の網羅や、現在の営業を保証しません。表示がない地域でも店舗が存在する場合があります。地名検索は主要地域と登録済みの名称・住所が対象です。
          </p>
          {stationRegions.map((region) => (
            <p key={region.name}>
              {region.name}：{region.snapshot.elements.length}件 · {region.retrievedAt}取得
            </p>
          ))}
          <p>拠点データはアプリに同梱しており、自動更新しません。</p>
        </section>
        <section>
          <h2>道路が見やすい地図</h2>
          <p>
            国土地理院のベクトルタイルを使い、道路・川・鉄道・一部の地名を表示しています。色や線の太さを加工し、建物などは省略しています。位置の確認用で、経路案内や通行可否の判断には使えません。
          </p>
          <MapCredits />
          <p>
            <SourceLink href="https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html">
              国土地理院の利用条件
            </SourceLink>
          </p>
          <p>
            背景地図は提供実験のサービスです。仕様変更や停止の可能性があり、継続提供・常時表示を保証するものではありません。
          </p>
          <p>
            <SourceLink href={stationLicense}>拠点データのODbL 1.0</SourceLink>
          </p>
          <p>
            拠点データ © OpenStreetMap
            contributors。名称の整形・種別分類を行っています。元データと派生データにはODbL
            1.0が適用されます。
          </p>
        </section>
        <section>
          <h2>わかること・未確認のこと</h2>
          <p>
            名称・位置・種別は公開地図の登録情報で、誤りや古い情報を含む場合があります。営業状況、営業時間、住所、料金、空き状況、利用条件、車の入口は未確認です。公式サービスで確認してください。
          </p>
        </section>
        <section>
          <h2>通信について</h2>
          <p>
            表示範囲・縮尺に応じて国土地理院へ地図データを要求します。区画番号・IPアドレスなどが配信元へ伝わり、閲覧地域を推測できます。GPS座標そのもの・プロフィール・学習回答・相談メモはアプリから送信しません。
          </p>
          <p>
            現在地は明示的に操作・許可したときだけ一度取得します。周辺の掲載拠点は端末内で絞り込みます。現在地やその表示範囲は永続保存せず、再起動・非表示・10分経過で消去します。端末の測位自体はOSの位置情報サービスを使用します。
          </p>
          <p>
            最近見た地図は一時的に再利用します。新しい場所や再起動後の背景地図には通信が必要です。通信できない場合も、取得済みの拠点一覧と保存は利用できます。
          </p>
          <details>
            <summary tabIndex={0}>今回の地図読み込み（検証用）</summary>
            <p>
              この起動中の端末内計測です。外部送信しません。画面描画時間や請求額を表す値ではありません。
            </p>
            <dl className="map-metrics">
              <dt>取得開始</dt>
              <dd data-metric="requests">{metrics.requests}回</dd>
              <dt>取得完了</dt>
              <dd data-metric="completed">{metrics.completed}区画</dd>
              <dt>取得データ量</dt>
              <dd data-metric="bytes">{metrics.bytes} bytes（PBF本文）</dd>
              <dt>メモリから再利用</dt>
              <dd data-metric="hits">{metrics.hits}区画</dd>
              <dt>背景地図がない区画</dt>
              <dd>{metrics.missing}回</dd>
              <dt>失敗 / 中断</dt>
              <dd>
                {metrics.failed} / {metrics.aborted}回
              </dd>
              <dt>一時保存</dt>
              <dd>
                {metrics.cachedTiles}区画 · {(metrics.cachedBytes / 1024 / 1024).toFixed(2)} MiB /
                上限8 MiB
              </dd>
            </dl>
            <p>
              再利用期限は15分。ブラウザ自身のキャッシュは別です。ヘッダー・圧縮・中断分を含む実通信量とは異なります。
            </p>
          </details>
        </section>
        <section>
          <h2>使用データ</h2>
          <details>
            <summary tabIndex={0}>地図表示ライブラリのライセンス</summary>
            <pre>{leafletLicense + '\n' + vectorLicense}</pre>
          </details>
          <p>データは先頭20件を表示します。全件は下の配布元から確認できます。</p>
          <details onToggle={(e) => setRawOpen(e.currentTarget.open)}>
            <summary tabIndex={0}>元データを表示</summary>
            {rawOpen && (
              <pre>
                {JSON.stringify(
                  { ...stationSnapshot, elements: stationSnapshot.elements.slice(0, 20) },
                  null,
                  2,
                )}
              </pre>
            )}
          </details>
          <details onToggle={(e) => setDerivedOpen(e.currentTarget.open)}>
            <summary tabIndex={0}>表示用データを表示（ODbL）</summary>
            {derivedOpen && <pre>{JSON.stringify(realStations.slice(0, 20), null, 2)}</pre>}
          </details>
          <p>
            <SourceLink href="https://github.com/Greek-Academy/Let-s-go-anywhere/tree/codex/issue-83-national-stations/src/data">
              拠点データの配布元
            </SourceLink>
          </p>
        </section>
        <PrimaryButton variant="secondary" onClick={() => navigate('/cars/search')}>
          掲載外の地域・拠点を探す
        </PrimaryButton>
        <button className="text-button" onClick={() => navigate('/cars/sample')}>
          以前のサンプル地図を見る
        </button>
      </div>
    </div>
  )
}
