import { ArrowLeft, ArrowRight, CarFront, Heart } from 'lucide-react'
import { useRef } from 'react'
import type { WebSpot } from '../domain/webSearch'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { useWebSearch } from '../state/WebSearchState'
import {
  EmptyState,
  Header,
  IconButton,
  InfoRows,
  PrimaryButton,
  SectionHeading,
  useBack,
} from '../components/ui'
import { WebSpotImage, WebSpotSource, WebSpotStatus, searchDate } from '../components/WebSpotCard'

export function WebSpotDetail() {
  const { id } = useParams()
  const { state, update, storageProtected } = useApp()
  const { result, toggleSaved } = useWebSearch()
  const navigate = useNavigate()
  const location = useLocation()
  const back = useBack(location.state?.tab === 'saved' ? '/saved' : '/discover')
  // Keep this view usable after removing a saved item, until leaving the screen.
  const found = result?.spots.find((s) => s.id === id)
  const stored = state.savedWebSpots.find((s) => s.id === id)
  const current = location.state?.tab === 'saved' ? (stored ?? found) : (found ?? stored)
  const last = useRef<WebSpot | null>(null)
  if (current) last.current = current
  const spot = current ?? (last.current?.id === id ? last.current : null)
  const saved = state.savedWebSpots.some((s) => s.id === id)
  if (!spot)
    return (
      <div className="screen">
        <Header back title="Webで見つけた候補" />
        <EmptyState
          title="この候補を表示できません"
          description="未保存の検索結果は、再読み込みすると消えます。「行きたい」に保存した候補から開くか、検索画面へ戻ってください。"
          action="行きたいを見る"
          onAction={() => navigate('/saved')}
        />
      </div>
    )
  return (
    <div className="screen event-detail">
      <div className="detail-hero">
        <WebSpotImage />
        <div className="detail-hero-actions">
          <IconButton icon={ArrowLeft} label="戻る" onClick={back} />
          <IconButton
            icon={Heart}
            label={saved ? '行きたいから外す' : '行きたいに保存'}
            aria-pressed={saved}
            disabled={storageProtected}
            className={saved ? 'heart-active' : ''}
            onClick={() => toggleSaved(spot)}
          />
        </div>
      </div>
      <div className="detail-body page-pad">
        <WebSpotStatus spot={spot} />
        <h1>{spot.name}</h1>
        <p className="detail-subtitle">{spot.area}</p>
        <p className="body-copy">{spot.summary}</p>
        <SectionHeading title="希望に合うと考えた理由" />
        <p className="body-copy">{spot.matchReason}</p>
        <p className="notice">
          {spot.mode === 'sample'
            ? '架空の検索サンプルです。出典リンクも動作確認用です。'
            : 'AIが検索情報を整理した候補です。施設への確認は行っていません。訪問前に出典で最新情報を確認してください。'}
        </p>
        <WebSpotSource spot={spot} />
        <InfoRows
          rows={[
            ['検索日時', `${searchDate(spot.retrievedAt)}（情報の確認日ではありません）`],
            ['地域', spot.area],
            ['営業状況・営業時間', '未確認'],
            ['料金・予約条件', '未確認'],
            ['駐車場・車の入口', '未確認'],
            ['距離・所要時間', '未確認'],
            ['写真・利用条件', '未取得・未確認'],
          ]}
        />
        <PrimaryButton
          icon={Heart}
          disabled={storageProtected}
          variant={saved ? 'secondary' : 'primary'}
          onClick={() => toggleSaved(spot)}
        >
          {saved ? '行きたいに保存済み' : '行きたいに保存'}
        </PrimaryButton>
        <p className="small muted">
          この端末に保存します。保存しても確認済み情報には変わりません。
        </p>
        <div className="divider" />
        <SectionHeading
          title="このお出かけに向けて"
          subtitle="知識や気になることを、自分のペースで整理しましょう。"
        />
        <PrimaryButton
          icon={ArrowRight}
          onClick={() => {
            update((s) => ({ ...s, memo: { ...s.memo, goal: spot.name } }))
            navigate('/check', { state: { tab: location.state?.tab || 'discover' } })
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
      </div>
    </div>
  )
}
