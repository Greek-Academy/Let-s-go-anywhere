import { useWebSearch } from '../state/WebSearchState'
import type { WebSearchResult } from '../domain/webSearch'
import {
  personalRecommendations,
  preferenceWeights,
  providerNames,
} from '../domain/recommendations'
import { useApp } from '../state/AppState'
import { WebSpotCard } from './WebSpotCard'
import { Chip, EmptyState, SectionHeading } from './ui'

export function ComparisonResults({ result }: { result: WebSearchResult }) {
  const isEvent = result.query.purpose === 'events'
  const { state } = useApp()
  const {
    comparisonView: { order },
    setComparisonView,
  } = useWebSearch()
  const { weights, likes } = preferenceWeights(state.savedWebSpots, result.mode)
  const ordered =
    !isEvent && order === 'personal'
      ? personalRecommendations(result.spots, state.savedWebSpots, result.mode)
      : result.spots
  return (
    <div className="comparison-results">
      <SectionHeading
        title={`${result.spots.length}件の${isEvent ? 'イベント' : 'お店・スポット'}候補`}
        subtitle={
          result.mode === 'sample'
            ? '架空サンプルです。APIは使っていません。'
            : '気になる場所をタップして、詳しい情報を確認できます。'
        }
      />
      {!!result.duplicates && (
        <p className="small muted">重なった提案{result.duplicates}件をまとめました。</p>
      )}
      {result.spots.length < (result.query.drive ? 10 : 15) && (
        <p className="notice">
          {result.query.drive ? '10件を目安に探していますが' : '目標は合計15〜20件ですが'}、今回は
          {result.spots.length}
          件です。件数を埋めるための架空情報や、自動の追加検索は行いません。
        </p>
      )}
      {!isEvent && (
        <>
          <div className="comparison-order" aria-label="おすすめの並び順">
            <Chip
              selected={order === 'general'}
              onClick={() => setComparisonView({ order: 'general' })}
            >
              一般的なおすすめ
            </Chip>
            <Chip
              selected={order === 'personal'}
              onClick={() => setComparisonView({ order: 'personal' })}
            >
              好みに寄せたおすすめ
            </Chip>
          </div>
          <p className="small muted">
            {order === 'general'
              ? '今回の地域・希望に対する提案です。2社の候補を交互に表示します。'
              : likes
                ? `保存した${likes}件を参考に、同じ特徴を持つ候補を上へ。ときどき違う候補も表示します。好みはまだ仮のものです。`
                : 'まだ参考にできるいいねがありません。気になる候補のハートを押してみてください。今は一般的な順番です。'}
          </p>
          {order === 'personal' && likes > 0 && (
            <div className="preference-summary">
              <span>参考にしている特徴</span>
              <p>
                {[...weights]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([tag, count]) => `${tag}（${count}件）`)
                  .join('・')}
              </p>
            </div>
          )}
        </>
      )}
      {isEvent && (
        <p className="notice">
          開催日・会場を出典からAIが整理した候補です。開催の変更や中止、予約の要否は、訪問前に主催者の情報で確認してください。件数を増やすための自動再検索はしません。
        </p>
      )}
      {result.reports
        ?.filter((r) => r.state === 'failed')
        .map((r) => (
          <p className="notice" role="alert" key={r.provider}>
            {providerNames[r.provider]}：{r.error} 自動では再検索しません。
          </p>
        ))}
      {ordered.length ? (
        <div className="event-list">
          {ordered.map((spot) => (
            <WebSpotCard key={spot.id} spot={spot} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="この条件の候補はありません"
          description="希望の言葉や出発地を変えて探せます。"
        />
      )}
    </div>
  )
}
