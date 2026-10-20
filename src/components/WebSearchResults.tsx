import { sameEventDates, eventDatesLabel } from '../domain/eventSearch'
import { sameDriveQuery } from '../domain/driveSearch'
import type { DriveQuery } from '../domain/driveSearch'
import type { EventDates } from '../domain/eventSearch'
import { sameCenter } from '../domain/discoveryLocation'
import type { DiscoveryCenter } from '../domain/discoveryLocation'
import { searchTheme } from '../domain/searchTheme'
import { ComparisonResults } from './ComparisonResults'
import { useWebSearch } from '../state/WebSearchState'
import { useApp } from '../state/AppState'
import { WebSpotCard } from './WebSpotCard'
import { EmptyState, SectionHeading } from './ui'

export function WebSearchResults({
  drive,
  eventDates,
  stationId,
  location,
  region,
  theme,
  category,
  tag,
}: {
  drive?: DriveQuery
  eventDates?: EventDates | null
  stationId?: string
  location?: DiscoveryCenter
  region: string | null
  theme: string
  category: string
  tag: string
}) {
  const { result, loading, error, status, showSamples } = useWebSearch()
  const { state } = useApp()
  const searchedDrive = result?.query.drive ?? drive
  const changed =
    result &&
    (!sameDriveQuery(result.query.drive, drive) ||
      !!result.query.locationSearch ||
      !sameCenter(result.query.location, location) ||
      (result.kind === 'comparison' && result.query.stationId !== stationId) ||
      (result.kind === 'comparison' ? region !== result.query.region : region !== '京都府') ||
      (category === 'イベント'
        ? !sameEventDates(eventDates, result.query.eventDates)
        : searchTheme(theme, tag) !== result.query.theme))
  return (
    <section className="web-search-results" aria-label="Web検索の結果" aria-busy={loading}>
      <div className="web-result-heading">
        <h2>
          {drive?.mode === 'events'
            ? '趣味のイベント'
            : drive?.mode === 'conditions'
              ? '選んだ条件のドライブ先'
              : drive?.mode === 'free'
                ? '入力した希望の行き先'
                : drive
                  ? '好きなことから見つかるドライブ先'
                  : 'Webで見つける'}
        </h2>
        <button className="text-button" onClick={showSamples}>
          検索結果を閉じる
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
      {status?.demo && (
        <p className="small muted">
          架空サンプルで接続を確認中です。実検索・API費用は発生しません。
        </p>
      )}
      <p className="small muted">
        {searchedDrive
          ? `片道${searchedDrive.duration}を目安に探した候補です。所要時間が未確認の候補は時間条件への適合も未確認です。高速道路の利用・県越え・営業時間・車の入口は訪問前に確認してください。`
          : '距離・営業状況は未確認です。選んだ地点の周辺約2kmは探索の目安で、範囲内であることを保証するものではありません。'}
      </p>
      {result && (
        <>
          <p className="web-query-label">
            検索した条件：{result.query.region} ／{' '}
            {result.query.eventDates
              ? `イベント・${eventDatesLabel(result.query.eventDates)}（日本時間）${result.query.drive?.hobbies.length ? ' ／ ' + result.query.drive.hobbies.join('・') : ''}`
              : result.query.theme}
          </p>
          {result.query.drive?.mode === 'default' && (
            <p className="small muted web-hobby-query-label">
              {result.query.drive.hobbies.length
                ? `選んだ趣味：${result.query.drive.hobbies.join('・')}`
                : '趣味は未選択のため、ジャンルを限定せずに探しました。'}
            </p>
          )}
          {result.query.drive?.mode === 'conditions' && (
            <p className="small muted web-drive-query-label">
              {[
                ...result.query.drive.activities,
                result.query.drive.road,
                result.query.drive.timing,
                result.query.drive.pace,
              ]
                .filter((v) => v !== 'こだわらない')
                .join('・')}{' '}
              ／ 片道{result.query.drive.duration}
            </p>
          )}
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
              出典・日付・形式・所要時間などの確認で{result.omitted}件を除外しました。
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
