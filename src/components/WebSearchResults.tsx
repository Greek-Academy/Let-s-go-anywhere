import { ComparisonResults } from './ComparisonResults'
import { useWebSearch } from '../state/WebSearchState'
import { useApp } from '../state/AppState'
import { WebSpotCard } from './WebSpotCard'
import { EmptyState } from './ui'

export function WebSearchResults() {
  const { result, loading, error, status } = useWebSearch()
  const { state } = useApp()
  return (
    <section className="web-search-results" aria-label="Web検索の結果" aria-busy={loading}>
      {loading && (
        <p className="notice" role="status">
          候補を探しています。最大2分ほどかかる場合があります。
        </p>
      )}
      {error && (
        <p className="notice web-search-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.kind === 'comparison' ? (
            <ComparisonResults result={result} />
          ) : result.spots.length ? (
            <div className="event-list">
              {result.spots.map((spot) => (
                <WebSpotCard key={spot.id} spot={spot} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="出典のある候補が見つかりませんでした"
              description="希望の言葉を変えて探せます。自動では再検索しません。"
            />
          )}
          {!!result.omitted && (
            <p className="small muted">
              出典・日付・形式・所要時間などの確認で{result.omitted}件を除外しました。
            </p>
          )}
        </>
      )}
      {status?.demo && (
        <p className="small muted">
          架空サンプルで接続を確認中です。実検索・API費用は発生しません。
        </p>
      )}
      {state.savedWebSpots.length > 0 && (
        <p className="small muted">保存したWeb候補は「行きたい」から確認できます。</p>
      )}
    </section>
  )
}
