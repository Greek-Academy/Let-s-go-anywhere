import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CarFront,
  ChevronRight,
  ExternalLink,
  Heart,
  Info,
  List,
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
  findPilotArea,
  pilotAreas,
  realStations,
  stationRetrievedAt,
  stationSnapshot,
  stationLicense,
} from '../domain/realStations'
import type { Bounds, RealMapState, RealStation } from '../domain/realStations'
import datasetUrl from '../data/kyoto-car-stations.osm.json?url'

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
      <SourceLink href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</SourceLink>
      <span>
        {' '}
        · 拠点：©{' '}
        <SourceLink href="https://www.openstreetmap.org/copyright">
          OpenStreetMap contributors
        </SourceLink>
        （ODbL）
      </span>
    </div>
  )
}
export function RealStationCard({
  station,
  onClick,
}: {
  station: RealStation
  onClick: () => void
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
function StationFacts() {
  return (
    <>
      <p className="body-copy">
        公開地図に登録された名称と位置です。現在の営業状況、正確な車の入口は事業者に確認してください。
      </p>
      <InfoRows
        rows={[
          ['所在地', `京都市・公開地図上の位置（住所未確認）`],
          ['営業時間・入出庫', '未確認 · 公式で確認'],
          ['登録・返却・車両条件', '未確認 · 公式で確認'],
          ['空き状況・料金', '取得していません'],
          ['データ取得日', stationRetrievedAt],
          ['運営による確認日', '未確認'],
        ]}
      />
    </>
  )
}
export function RealCars() {
  const { state, update } = useApp()
  const navigate = useNavigate()
  const map = state.realMap
  const patch = (values: Partial<RealMapState>) =>
    update((s) => ({ ...s, realMap: { ...s.realMap, ...values } }))
  const filtered = useMemo(() => filterRealStations(map), [map])
  const [fit, setFit] = useState<{ bounds: Bounds; key: number } | null>(null)
  const visibleBounds = useRef<Bounds>(map.bounds)
  const [moved, setMoved] = useState(false)
  const [sheet, setSheet] = useState<'filters' | 'station' | null>(null)
  const [draftProviders, setDraftProviders] = useState(map.providers)
  const [draftType, setDraftType] = useState(map.type)
  const selected = filtered.find((station) => station.id === map.selected)
  const preview = selected || filtered[0]
  const providers = [...new Set(realStations.map((station) => station.provider))]
  const select = (station: RealStation) => {
    patch({ selected: station.id })
    setSheet('station')
  }
  const search = (query = map.query) => {
    const area = findPilotArea(query || '京都中心部')
    if (!area) {
      patch({ unsupported: true, appliedArea: query.trim(), selected: null })
      return
    }
    patch({
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
        area: map.query.trim() || map.appliedArea,
        type: map.type,
        provider: null,
      },
    }))
    navigate('/cars/search')
  }
  const empty = (
    <div className="real-map-empty" role="status">
      <strong>
        {map.unsupported ? 'この地域はまだ収録していません' : 'この条件の掲載拠点はありません'}
      </strong>
      <p>京都中心部の10件で試しています。周辺に拠点が存在しないという意味ではありません。</p>
      <button
        className="text-button"
        onClick={() => {
          patch({ ...createRealMapState(), mode: map.mode })
          setFit({ bounds: createRealMapState().bounds, key: Date.now() })
        }}
      >
        京都の全掲載拠点を表示
      </button>
    </div>
  )
  return (
    <div className={`real-cars-screen ${map.mode === 'list' ? 'real-cars-list' : ''}`}>
      <h1 className="sr-only">
        {map.mode === 'map' ? '車を探す・実地図' : '借りる場所を探す・京都'}
      </h1>
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
            placeholder="京都・京都駅・四条烏丸など"
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
              setDraftProviders(map.providers)
              setDraftType(map.type)
              setSheet('filters')
            }}
          />
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
                stations={filtered}
                selected={map.selected}
                view={map}
                fit={fit}
                onSelect={select}
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
            <span className="real-map-pilot">京都中心部の公開データ · 現在地は取得しません</span>
          </div>
          <MapCredits />
          <div className="real-map-preview">
            <span className="sheet-handle" />
            <div className="real-preview-heading">
              <h2>借りる場所の候補</h2>
              <button className="text-button" onClick={() => patch({ mode: 'list' })}>
                <List size={16} /> 一覧で見る
              </button>
            </div>
            {preview ? (
              <RealStationCard station={preview} onClick={() => select(preview)} />
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
          <p className="small muted">
            名称・位置は公開データです。空き状況・料金・営業状況は公式で確認してください。
          </p>
          <div className="station-list">
            {filtered.map((station) => (
              <RealStationCard
                key={station.id}
                station={station}
                onClick={() => {
                  patch({ selected: station.id })
                  navigate(`/cars/places/${station.id}`)
                }}
              />
            ))}
          </div>
          {!filtered.length && empty}
          <PrimaryButton variant="secondary" icon={ExternalLink} onClick={externalSearch}>
            掲載外の地域・拠点を探す
          </PrimaryButton>
          <MapCredits />
        </div>
      )}
      {sheet === 'station' && selected && (
        <BottomSheet title="この拠点について" onClose={() => setSheet(null)}>
          <Tag>{selected.type}</Tag>
          <h3 className="real-station-title">{selected.name}</h3>
          <StationFacts />
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
          <p className="body-copy">京都の取得済みデータから表示します。</p>
          <h3>サービスの種類</h3>
          <div className="chips">
            {(['すべて', 'レンタカー', 'カーシェア'] as const).map((type) => (
              <Chip key={type} selected={draftType === type} onClick={() => setDraftType(type)}>
                {type}
              </Chip>
            ))}
          </div>
          <h3 className="real-filter-title">事業者</h3>
          <div className="real-provider-options">
            {providers.map((provider) => (
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
        <StationFacts />
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
  return (
    <div className="screen">
      <Header back={back} title="地図・拠点の情報" />
      <div className="page-pad real-map-sources">
        <p className="eyebrow teal">KYOTO · FIRST LOOK</p>
        <h1>
          場所を知って、
          <br />
          公式で確かめる。
        </h1>
        <section>
          <h2>まずは京都の10件から</h2>
          <p>
            京都駅・四条烏丸・烏丸御池・三条京阪周辺の公開データを試しています。全国検索や、周辺の全拠点を網羅するものではありません。
          </p>
          <div className="chips">
            {pilotAreas.map((area) => (
              <Tag key={area.name}>{area.name}</Tag>
            ))}
          </div>
          <p>
            拠点は{stationRetrievedAt}
            取得のデータです。画面を更新しても拠点データは自動更新されません。
          </p>
        </section>
        <section>
          <h2>地図と拠点は別の情報源です</h2>
          <p>
            地図：国土地理院の淡色地図を、表示する範囲に合わせて読み込みます。拠点：OpenStreetMapの名称・座標を使っています。
          </p>
          <MapCredits />
          <p>
            <SourceLink href="https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html">
              国土地理院の利用規約
            </SourceLink>{' '}
            · <SourceLink href={stationLicense}>拠点データのODbL 1.0</SourceLink>
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
            名称と位置は公開地図の登録情報です。営業状況、営業時間、住所、料金、空き状況、利用条件、車の入口は未確認です。公式サービスで確認してから利用を検討してください。
          </p>
        </section>
        <section>
          <h2>通信について</h2>
          <p>
            地図を開くと、表示範囲の地図画像を国土地理院から取得します。端末のIPアドレスなど通常の通信情報が配信先に伝わります。GPS現在地・プロフィール・学習回答・相談メモは送信しません。
          </p>
          <p>
            通信できない場合も拠点の一覧と保存は利用できます。地図の一括ダウンロードは行いません。
          </p>
        </section>
        <section>
          <h2>使用データ</h2>
          <details>
            <summary tabIndex={0}>地図表示ライブラリ（Leaflet）のライセンス</summary>
            <pre>{leafletLicense}</pre>
          </details>
          <p>地図データの基準時刻：{stationSnapshot.osm3s.timestamp_osm_base}</p>
          {!isNativeApp && (
            <a className="text-button" href={datasetUrl} download="kyoto-car-stations.osm.json">
              元データ（JSON / ODbL）を保存
            </a>
          )}
          <details>
            <summary tabIndex={0}>元データを表示</summary>
            <pre>{JSON.stringify(stationSnapshot, null, 2)}</pre>
          </details>
          <details>
            <summary tabIndex={0}>表示用データを表示（ODbL）</summary>
            <pre>{JSON.stringify(realStations, null, 2)}</pre>
          </details>
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
