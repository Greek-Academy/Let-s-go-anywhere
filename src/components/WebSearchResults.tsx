import { searchTheme } from '../domain/searchTheme'
import { ComparisonResults } from './ComparisonResults'
import { useWebSearch } from '../state/WebSearchState'
import { useApp } from '../state/AppState'
import { WebSpotCard } from './WebSpotCard'
import { EmptyState, SectionHeading } from './ui'

export function WebSearchResults({
  stationId,
  region,
  theme,
  category,
  tag,
}: {
  stationId?: string
  region: string | null
  theme: string
  category: string
  tag: string
}) {
  const { result, loading, error, status, showSamples } = useWebSearch()
  const { state } = useApp()
  const changed =
    result &&
    ((result.kind === 'comparison' && result.query.stationId !== stationId) ||
      (result.kind === 'comparison' ? region !== result.query.region : region !== '京都府') ||
      searchTheme(theme, tag) !== result.query.theme ||
      !['おすすめ', 'スポット'].includes(category))
  return (
    <section className="web-search-results" aria-label="Web検索の結果" aria-busy={loading}>
      <div className="web-result-heading">
        <h2>Webで見つける</h2>
        <button className="text-button" onClick={showSamples}>
          サンプル表示に戻る
        </button>
      </div>
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
      {status && (
        <p className="small muted">
          {status.demo
            ? '架空サンプルで接続を確認中です。実検索・API費用は発生しません。'
            : status.maxAttempts === null
              ? `これまでの検索：${status.attemptCount}回。回数上限なし。新しい検索にはAPI料金がかかります。`
              : `${status.kind === 'comparison' ? '比較検索' : '実検索'} ${status.attempts.length} / ${status.maxAttempts} 回。再読み込み・保存・詳細表示では検索しません。`}
        </p>
      )}
      <p className="small muted">
        予算・帰宅時刻・避けたい運転場面への適合、距離・営業状況は未確認です。駅周辺の約2kmは探索の目安で、範囲内であることを保証するものではありません。
      </p>
      {result && (
        <>
          <p className="web-query-label">
            検索した条件：{result.query.region} ／ {result.query.theme}
          </p>
          {changed && (
            <p className="notice" role="status">
              入力条件が変わっています。下は前回の検索結果です。新しい条件を検索ボタンで送信してください。
            </p>
          )}
          {result.kind === 'comparison' ? (
            <ComparisonResults result={result} />
          ) : result.spots.length ? (
            <>
              <SectionHeading
                title={`${result.spots.length}件の候補が見つかりました`}
                subtitle={
                  result.mode === 'sample'
                    ? 'すべて架空の検索サンプルです。'
                    : 'AIが整理した候補です。出典と見比べてください。'
                }
              />
              <div className="event-list">
                {result.spots.map((spot) => (
                  <WebSpotCard key={spot.id} spot={spot} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="出典のある候補が見つかりませんでした"
              description="希望の言葉を変えて探せます。自動では再検索しません。"
            />
          )}
          {!!result.omitted && (
            <p className="small muted">
              出典・形式・重複の確認で{result.omitted}件を除外しました。
            </p>
          )}
        </>
      )}
      {state.savedWebSpots.length > 0 && (
        <p className="small muted">保存したWeb候補は「行きたい」から確認できます。</p>
      )}
    </section>
  )
}
