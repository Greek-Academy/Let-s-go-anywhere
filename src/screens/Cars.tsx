import { ExternalModal } from '../components/ExternalLinkModal'
import { useContent } from '../content/ContentProvider'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CarFront,
  Check,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Heart,
  KeyRound,
  List,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'

import type { Station, StationType } from '../data/types'
import type { AppState } from '../state/AppState'
import { useApp } from '../state/AppState'
import { CarIllustration, StationCard } from '../components/Cards'
import { RentalMap } from '../components/RentalMap'
import {
  BottomSheet,
  Chip,
  Choice,
  EmptyState,
  Header,
  IconButton,
  InfoRows,
  Modal,
  PrimaryButton,
  SampleNote,
  Tag,
} from '../components/ui'

export function filteredStations(map: AppState['map'], stations: readonly Station[]) {
  const area = map.area.includes('新宿')
    ? '新宿'
    : map.area.includes('渋谷') || map.area === '東京'
      ? '渋谷'
      : ''
  return stations.filter(
    (s) =>
      s.area === area &&
      (map.type === 'すべて' || s.type === map.type) &&
      (!map.providers.length || map.providers.includes(s.provider)),
  )
}
export function Cars() {
  const { stations, source } = useContent()
  const providers = [...new Set(stations.map((station) => station.provider))]
  const { state, update, toast } = useApp()
  const navigate = useNavigate()
  const map = state.map
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [external, setExternal] = useState<{ stationId: string; kind: 'official' | 'map' } | null>(
    null,
  )
  const externalStation = stations.find((station) => station.id === external?.stationId)
  const [draftType, setDraftType] = useState<StationType>(map.type)
  const [draftProviders, setDraftProviders] = useState(map.providers)
  const filtered = filteredStations(map, stations)
  const selected = filtered.find((s) => s.id === map.selected)
  const preview = selected ?? filtered[0]
  const setMap = (patch: Partial<typeof map>) =>
    update((s) => ({ ...s, map: { ...s.map, ...patch } }))
  const openFilter = () => {
    setDraftType(map.type)
    setDraftProviders(map.providers)
    setFiltersOpen(true)
  }
  const submitSearch = (e?: FormEvent) => {
    e?.preventDefault()
    const area = map.query.trim() || map.area
    setMap({ area, selected: null, offset: { x: 0, y: 0 } })
    setExpanded(false)
    toast(`${area}のサンプル拠点を検索しました`)
  }
  const onSelect = (station: Station) => {
    setMap({ selected: station.id })
    setExpanded(true)
  }
  const types = (
    <div className="chips map-type-chips">
      {(['すべて', 'レンタカー', 'カーシェア'] as StationType[]).map((type) => (
        <Chip
          key={type}
          selected={map.type === type}
          onClick={() => {
            setMap({ type, selected: null })
            setExpanded(false)
          }}
        >
          {type === 'レンタカー' && <CarFront size={13} />}
          {type === 'カーシェア' && <KeyRound size={12} />}
          {type}
        </Chip>
      ))}
    </div>
  )
  return (
    <div className={`cars-screen ${map.mode === 'list' ? 'cars-list-screen screen' : ''}`}>
      {map.mode === 'map' ? (
        <>
          <RentalMap
            stations={filtered}
            selected={map.selected}
            onSelect={onSelect}
            offset={map.offset}
            onPan={(offset) => setMap({ offset })}
            area={map.area.includes('新宿') ? '新宿' : '渋谷'}
          />
          <div className="map-top">
            <form className="map-search" onSubmit={submitSearch}>
              <Search size={19} />
              <input
                aria-label="駅名・地域から車を探す"
                value={map.query}
                onChange={(e) => setMap({ query: e.target.value })}
                placeholder={map.area || '駅名・地域から探す'}
              />
              {map.query && (
                <IconButton
                  icon={X}
                  label="地図検索をクリア"
                  onClick={() => setMap({ query: '' })}
                />
              )}
              <IconButton
                icon={UserRound}
                label="マイページを開く"
                className="profile-button"
                onClick={() => navigate('/profile', { state: { tab: 'cars' } })}
              />
            </form>
            {types}
            <button className="search-area-button" onClick={() => submitSearch()}>
              <Search size={12} />
              このエリアで検索
            </button>
          </div>
          <span className="map-sample-label">地図・拠点は配置のサンプルです</span>
          <div className="map-control-stack">
            <IconButton
              icon={Crosshair}
              label="現在地の表示デモ"
              onClick={() => setLocationOpen(true)}
            />
            <IconButton
              icon={SlidersHorizontal}
              label="車の事業者フィルター"
              className={map.providers.length ? 'has-filter' : ''}
              onClick={openFilter}
            />
            <IconButton
              icon={List}
              label="車の一覧に切り替え"
              onClick={() => setMap({ mode: 'list' })}
            />
          </div>
          <div className={`map-preview ${expanded ? 'is-selected' : ''}`}>
            <button
              className="preview-handle-button"
              aria-label={expanded ? '拠点カードを縮小' : '拠点カードを広げる'}
              onClick={() => {
                if (preview) {
                  setMap({ selected: preview.id })
                  setExpanded(!expanded)
                }
              }}
            >
              <span className="sheet-handle" />
            </button>
            <div className="map-preview-heading">
              <h2>{expanded && preview ? 'この拠点について' : '出発地周辺の車'}</h2>
              {expanded ? (
                <IconButton
                  icon={X}
                  label="拠点カードを閉じる"
                  onClick={() => {
                    setExpanded(false)
                    setMap({ selected: null })
                  }}
                />
              ) : (
                <button className="text-button" onClick={() => setMap({ mode: 'list' })}>
                  <List size={16} />
                  一覧 <span>{filtered.length}</span>
                </button>
              )}
            </div>
            {preview ? (
              <>
                <StationCard
                  station={preview}
                  onClick={() => {
                    if (expanded) navigate(`/stations/${preview.id}`)
                    else onSelect(preview)
                  }}
                />
                {expanded && (
                  <div className="preview-extra">
                    <InfoRows
                      rows={[
                        ['所在地', preview.address],
                        ['営業時間', preview.hours],
                        ['利用条件', preview.conditions],
                        ['情報確認日', preview.checkedAt],
                      ]}
                    />
                    <PrimaryButton
                      icon={ExternalLink}
                      onClick={() => setExternal({ stationId: preview.id, kind: 'official' })}
                    >
                      公式で空き状況・予約を確認
                    </PrimaryButton>
                    <PrimaryButton
                      variant="secondary"
                      icon={MapPin}
                      onClick={() => setExternal({ stationId: preview.id, kind: 'map' })}
                    >
                      外部地図で行き方を見る
                    </PrimaryButton>
                  </div>
                )}
                <PrimaryButton
                  variant={expanded ? 'ghost' : 'primary'}
                  onClick={() => navigate(`/stations/${preview.id}`)}
                >
                  拠点の詳細を見る <ChevronRight size={16} />
                </PrimaryButton>
                <p className="map-footnote">空き状況・料金・予約は公式で確認</p>
              </>
            ) : (
              <EmptyState
                title="この条件の拠点はありません"
                description="地域や事業者の条件を変えて探せます。"
                action="渋谷のサンプルを表示"
                onAction={() =>
                  setMap({
                    area: '東京・渋谷駅周辺',
                    query: '',
                    type: 'すべて',
                    providers: [],
                    selected: null,
                  })
                }
              />
            )}
          </div>
          <div className="map-legend">
            <span className="share-dot" />
            カーシェア <span className="rental-dot" />
            レンタカー
          </div>
        </>
      ) : (
        <>
          <Header />
          <div className="page-pad">
            <p className="eyebrow teal">FIND YOUR NEXT RIDE</p>
            <p className="location-caption">
              <MapPin size={13} />
              出発地：{map.area}
            </p>
            <h1>借りる場所を探す</h1>
            <p className="body-copy">お出かけの準備は、近くの車探しから。</p>
            {types}
            <div className="map-list-controls">
              <PrimaryButton
                variant="secondary"
                icon={MapPin}
                onClick={() => setMap({ mode: 'map' })}
              >
                地図で見る
              </PrimaryButton>
              <IconButton
                icon={SlidersHorizontal}
                label="車の事業者フィルター"
                onClick={openFilter}
              />
            </div>
            <p className="result-count">{filtered.length}件のサンプル拠点</p>
            <div className="station-list">
              {filtered.map((s) => (
                <StationCard
                  key={s.id}
                  station={s}
                  onClick={() => {
                    setMap({ selected: s.id })
                    navigate(`/stations/${s.id}`)
                  }}
                />
              ))}
            </div>
            {!filtered.length && (
              <EmptyState
                title="条件に合う拠点がありません"
                description="種別・事業者を変更するか、地図で別の地域を検索してください。"
                action="条件をリセット"
                onAction={() => setMap({ type: 'すべて', providers: [] })}
              />
            )}
            <SampleNote>地図と一覧は、同じ検索条件の候補を表示します。</SampleNote>
          </div>
        </>
      )}
      {filtersOpen && (
        <BottomSheet title="地図の絞り込み" onClose={() => setFiltersOpen(false)}>
          <p className="body-copy">表示する拠点の条件を選びます。</p>
          <h3 className="filter-heading">サービスの種類</h3>
          <div className="chips">
            {(['すべて', 'レンタカー', 'カーシェア'] as StationType[]).map((t) => (
              <Chip key={t} selected={draftType === t} onClick={() => setDraftType(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <h3 className="filter-heading">
            事業者 <span className="muted small">複数選択可</span>
          </h3>
          <div className="filter-options">
            {providers.map((provider) => (
              <Choice
                key={provider}
                title={provider}
                description="サンプルの掲載拠点"
                selected={draftProviders.includes(provider)}
                icon={<CarFront size={22} />}
                onClick={() =>
                  setDraftProviders(
                    draftProviders.includes(provider)
                      ? draftProviders.filter((p) => p !== provider)
                      : [...draftProviders, provider],
                  )
                }
              />
            ))}
          </div>
          <PrimaryButton
            icon={Check}
            onClick={() => {
              setMap({ type: draftType, providers: draftProviders, selected: null })
              setExpanded(false)
              setFiltersOpen(false)
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
          <p className="muted small centered">事業者を選ばない場合は、すべて表示します。</p>
        </BottomSheet>
      )}
      {locationOpen && (
        <Modal title="現在地を表示するデモ" onClose={() => setLocationOpen(false)}>
          <div className="external-symbol">
            <Crosshair size={34} />
          </div>
          <p className="body-copy">
            このモックでは位置情報を取得しません。渋谷駅周辺を現在地のサンプルとして表示します。
          </p>
          <PrimaryButton
            onClick={() => {
              setMap({
                area: '東京・渋谷駅周辺',
                query: '',
                offset: { x: 0, y: 0 },
                selected: null,
              })
              setLocationOpen(false)
              setExpanded(false)
            }}
          >
            サンプルの現在地へ
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={() => setLocationOpen(false)}>
            手動でエリアを選ぶ
          </PrimaryButton>
        </Modal>
      )}
      {external && externalStation && (
        <ExternalModal
          title={externalStation.name}
          request={{
            type: 'listing',
            catalogSource: source,
            kind: external.kind,
            links: externalStation.links,
          }}
          kind={external.kind}
          onClose={() => setExternal(null)}
        />
      )}
    </div>
  )
}
export function StationDetail() {
  const { stations, source } = useContent()
  const { id } = useParams()
  const station = stations.find((s) => s.id === id)
  const navigate = useNavigate()
  const { state, toggleStation } = useApp()
  const [external, setExternal] = useState<'official' | 'map' | null>(null)
  if (!station)
    return (
      <>
        <Header back title="拠点詳細" />
        <EmptyState
          title="拠点が見つかりません"
          description="地図から別の候補を選べます。"
          action="車を探す"
          onAction={() => navigate('/cars')}
        />
      </>
    )
  const saved = state.savedStations.includes(station.id)
  return (
    <div className="screen station-detail">
      <Header back title="拠点の詳細" />
      <div className="page-pad">
        <div className="tags">
          <Tag tone={station.type === 'レンタカー' ? 'blue' : 'mint'}>{station.type}</Tag>
          <Tag tone="neutral">サンプル</Tag>
        </div>
        <h1>{station.name}</h1>
        <p className="station-provider">{station.provider}</p>
        <div className="station-vehicle-image">
          <CarIllustration blue={station.type === 'レンタカー'} />
          <span>車両はイメージです</span>
        </div>
        <InfoRows
          rows={[
            ['所在地', station.address],
            ['営業時間・入出庫', station.hours],
            ['登録・利用条件', station.conditions],
            ['返却条件', station.returnPolicy],
            ['講習での利用', '事業者・講師への確認が必要'],
            ['情報源', '画面設計用のモックデータ'],
            ['情報確認日', station.checkedAt],
          ]}
        />
        <SampleNote>拠点の存在・営業条件は仮の表示です。空き状況は取得していません。</SampleNote>
        <PrimaryButton icon={ExternalLink} onClick={() => setExternal('official')}>
          公式で空き状況・予約を確認
        </PrimaryButton>
        <PrimaryButton icon={Heart} variant="secondary" onClick={() => toggleStation(station.id)}>
          {saved ? '車候補に保存済み' : '車候補に保存'}
        </PrimaryButton>
        <PrimaryButton icon={MapPin} variant="secondary" onClick={() => setExternal('map')}>
          外部地図で行き方を見る
        </PrimaryButton>
        <p className="muted small centered">車候補の保存は、予約ではありません。</p>
      </div>
      {external && (
        <ExternalModal
          title={station.name}
          kind={external}
          request={{ type: 'listing', catalogSource: source, kind: external, links: station.links }}
          onClose={() => setExternal(null)}
        />
      )}
    </div>
  )
}
