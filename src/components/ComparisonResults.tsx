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
  const { state } = useApp()
  const {
    comparisonView: { order, provider },
    setComparisonView,
  } = useWebSearch()
  const { weights, likes } = preferenceWeights(state.savedWebSpots, result.mode)
  const ordered =
    order === 'personal'
      ? personalRecommendations(result.spots, state.savedWebSpots, result.mode)
      : result.spots
  const visible = ordered.filter(
    (s) => provider === 'all' || s.recommendations?.some((r) => r.provider === provider),
  )
  return (
    <div className="comparison-results">
      <SectionHeading
        title={`${result.spots.length}件のお店・スポット候補`}
        subtitle={
          result.mode === 'sample'
            ? '架空サンプルです。APIは使っていません。'
            : '2社の提案を、出典と一緒に見比べましょう。'
        }
      />
      {!!result.duplicates && (
        <p className="small muted">重なった提案{result.duplicates}件をまとめました。</p>
      )}
      {result.spots.length < 15 && (
        <p className="notice">
          目標は合計15〜20件ですが、今回は{result.spots.length}
          件です。出典のある候補だけを表示し、自動の追加検索はしません。
        </p>
      )}
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
      <details className="comparison-explanation">
        <summary>いいねはどう使われる？</summary>
        <p>
          この端末の保存候補と、選んだ「好きなところ」を参考に並び替えます。ハートの解除で参考から外れます。押さなかった候補を嫌いとは判断しません。
        </p>
        <p>
          特徴はAIによる分類です。価格帯は未確認のため使いません。好みの情報はAI・招待相手へ自動送信しません。この切り替えでAPI料金は発生しません。
        </p>
      </details>
      <div className="chips comparison-providers" aria-label="提案元で絞り込み">
        {(['all', 'openai', 'anthropic'] as const).map((value) => (
          <Chip
            key={value}
            selected={provider === value}
            onClick={() => setComparisonView({ provider: value })}
          >
            {value === 'all' ? 'すべて' : providerNames[value]}{' '}
            {value === 'all'
              ? result.spots.length
              : result.spots.filter((s) => s.recommendations?.some((r) => r.provider === value))
                  .length}
          </Chip>
        ))}
      </div>
      <details className="comparison-metrics">
        <summary>検索の結果・待ち時間・参考料金</summary>
        {result.reports?.map((r) => (
          <div key={r.provider} className="comparison-metric">
            <h3>
              {providerNames[r.provider]} <span>{r.count}件</span>
            </h3>
            <p className="small muted">
              {r.model} ／ {(r.elapsedMs / 1000).toFixed(1)}秒
            </p>
            <p className="small">
              {result.mode === 'sample'
                ? 'サンプルのため課金なし'
                : r.usage
                  ? `参考 $${r.usage.estimatedUsd.toFixed(4)} ／ Web検索${r.usage.searchCalls}回`
                  : '料金は未確定です。0円とは限りません。'}
            </p>
            {!!r.omitted && <p className="small">出典・形式の確認で{r.omitted}件を除外</p>}
            {r.error && <p className="field-error">{r.error}</p>}
          </div>
        ))}
        <p className="small muted">
          参考額は税・為替・前払い残高を含みません。最終的な請求は各社の利用明細で確認してください。
        </p>
      </details>
      {result.reports
        ?.filter((r) => r.state === 'failed')
        .map((r) => (
          <p className="notice" role="alert" key={r.provider}>
            {providerNames[r.provider]}：{r.error} 自動では再検索しません。
          </p>
        ))}
      {visible.length ? (
        <div className="event-list">
          {visible.map((spot) => (
            <WebSpotCard key={spot.id} spot={spot} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="この条件の候補はありません"
          description="取得できた候補は、別の提案元に切り替えて確認できます。"
        />
      )}
    </div>
  )
}
