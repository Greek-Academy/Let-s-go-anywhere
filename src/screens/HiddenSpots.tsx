import { Eye } from 'lucide-react'
import { useApp } from '../state/AppState'
import { useHiddenSpots } from '../hooks/useHiddenSpots'
import { Header, EmptyState } from '../components/ui'

export function HiddenSpots() {
  const { state } = useApp()
  const { restore, disabled } = useHiddenSpots()
  return (
    <div className="screen hidden-spots-screen">
      <Header back title="非表示にしたスポット" />
      <div className="page-pad">
        <h1>
          また気になったら、
          <br />
          いつでも戻せます。
        </h1>
        <p className="body-copy">
          ホームの候補から外したスポットです。「行きたい」に保存した内容はそのまま残ります。
        </p>
        {state.hiddenWebSpots.length ? (
          <>
            <p className="small muted">戻すと、今ある検索結果や次の検索で再び表示できます。</p>
            <ul className="hidden-spots-list">
              {state.hiddenWebSpots.map((spot, index) => (
                <li key={`${spot.mode}:${spot.name}:${spot.area}:${index}`}>
                  <h2>{spot.name}</h2>
                  <p className="small muted">
                    {spot.area}
                    {spot.mode === 'sample' ? ' · サンプル' : ''}
                  </p>
                  <button
                    className="text-button"
                    disabled={disabled}
                    aria-label={`${spot.name}を再び候補に表示する`}
                    onClick={() => {
                      void restore(spot)
                    }}
                  >
                    <Eye size={16} />
                    再び候補に表示する
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            title="非表示にしたスポットはありません"
            description="ホームのパネルで「今後表示しない」を選ぶと、ここから戻せます。"
          />
        )}
      </div>
    </div>
  )
}
