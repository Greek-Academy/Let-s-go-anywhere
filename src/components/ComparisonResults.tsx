import type { WebSearchResult } from '../domain/webSearch'
import { providerNames } from '../domain/recommendations'
import { WebSpotCard } from './WebSpotCard'
import { EmptyState } from './ui'

export function ComparisonResults({ result }: { result: WebSearchResult }) {
  return (
    <div className="comparison-results">
      {result.spots.length ? (
        <div className="event-list">
          {result.spots.map((spot) => (
            <WebSpotCard key={spot.id} spot={spot} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="この条件の候補はありません"
          description="希望の言葉や出発地を変えて探せます。"
        />
      )}
      {!!result.duplicates && (
        <p className="small muted">重なった提案{result.duplicates}件をまとめました。</p>
      )}
      {result.query.purpose === 'events' && (
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
    </div>
  )
}
