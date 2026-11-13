import { ComparisonResults } from './ComparisonResults'
import { useWebSearch } from '../state/WebSearchState'
import { useApp } from '../state/AppState'
import { WebSpotCard } from './WebSpotCard'
import { EmptyState } from './ui'
import { CarFront, Compass } from 'lucide-react'

export function WebSearchResults() {
  const { result, loading, waiting, cancelSearch, error, status } = useWebSearch()
  const { state } = useApp()
  // Describe the displayed result, even when the user has since edited the next search.
  const drive = result?.query.drive
  const fromHobbies = drive?.mode === 'default' && drive.hobbies.length > 0
  const basis = fromHobbies
    ? '選んだ趣味から'
    : drive?.mode === 'conditions'
      ? '選んだ気分・条件から'
      : drive?.mode === 'default'
        ? '出発地から'
        : 'あなたの希望から'
  return (
    <section className="web-search-results" aria-label="Web検索の結果" aria-busy={loading}>
      {loading && (
        <div className="notice" role="status">
          <div>
            <p>
              {waiting
                ? '前の検索が終わるのを待っています。このままお待ちください。'
                : '候補を探しています。最大2分ほどかかる場合があります。'}
            </p>
            {waiting && (
              <button className="text-button" onClick={cancelSearch}>
                待機をやめる
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="notice web-search-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.spots.length > 0 &&
            result.query.purpose !== 'events' &&
            drive?.mode !== 'events' && (
              <header className="drive-results-intro">
                <p className="drive-results-kicker">
                  <span className="drive-results-symbol" aria-hidden="true">
                    <Compass size={14} strokeWidth={1.7} />
                  </span>
                  {basis}
                  <span className="drive-results-rule" aria-hidden="true" />
                </p>
                <h2>
                  <span>次のドライブ、</span>
                  <span className="drive-results-accent">ここから。</span>
                </h2>
                {drive ? (
                  <p className="drive-results-distance">
                    <CarFront size={15} strokeWidth={1.7} aria-hidden="true" />
                    <span>
                      片道 <strong>{drive.duration}</strong> を目安に
                    </span>
                  </p>
                ) : (
                  <p className="drive-results-caption">立ち寄りたいスポットを集めました。</p>
                )}
              </header>
            )}
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
              出典・形式・所要時間などの確認で{result.omitted}件を除外しました。
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
