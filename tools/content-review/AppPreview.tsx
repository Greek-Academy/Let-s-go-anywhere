import { useEffect, useRef, useState } from 'react'
import { evaluateOuting } from '../../src/domain/outingLifecycle'
import type { AppPreviewSnapshot, AppPreviewWindow } from './previewProjection'

export function AppPreview({
  snapshot,
  onClose,
}: {
  snapshot: AppPreviewSnapshot
  onClose: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const apply = () => {
    const api = (frame.current?.contentWindow as AppPreviewWindow | null)?.driveplusReviewPreview
    try {
      if (!api) throw new Error('Preview not ready')
      api.present(snapshot)
      setError(false)
    } catch {
      setError(true)
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const status = evaluateOuting(snapshot.outing, now)
  return (
    <section className="review-app" aria-label="アプリ全体の確認">
      <header className="review-app-header">
        <div>
          <strong>入力候補のアプリ確認</strong>
          <p>未公開の表示テストです。保存・入力はこの確認画面を閉じると消えます。</p>
          <p>普段の保存データは使いません。車・教材・講習は既存のサンプルです。</p>
        </div>
        <button className="review-primary" onClick={onClose} autoFocus>
          入力に戻る
        </button>
      </header>
      <div className="review-app-status">
        <p>
          {status.recommendable
            ? '「見つける」の一覧から詳細を開き、ハートで保存を試せます。'
            : '未確認・期限切れ・終了などの候補は、おすすめに表示しません。詳細で理由を確認できます。'}
        </p>
        <button
          onClick={() => {
            const child = frame.current?.contentWindow
            if (child) child.location.hash = '/events/' + snapshot.outing.id
          }}
        >
          入力候補の詳細を見る
        </button>
      </div>
      {error && (
        <p role="alert">
          確認画面を読み込めませんでした。入力に戻ってもう一度開いてください。
          <button onClick={apply}>再試行</button>
        </p>
      )}
      <iframe
        ref={frame}
        src="./app.html#/discover"
        title="入力候補のスマホアプリ"
        onLoad={apply}
      />
    </section>
  )
}
