import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { PrimaryButton, SectionHeading } from './ui'

export function StorageNotice() {
  const { storageProblem } = useApp()
  const navigate = useNavigate()
  if (!storageProblem) return null
  return (
    <aside className="storage-notice" aria-label="端末内の保存状態">
      <p role="alert">自動保存を停止しています。このタブを閉じると、ここでの変更は失われます。</p>
      <button type="button" onClick={() => navigate('/settings')}>
        保存の状態を確認
      </button>
    </aside>
  )
}

export function StorageDetails() {
  const { storageProblem, storageProtected, retryStorage, downloadStoredData } = useApp()
  const description = !storageProblem
    ? 'このブラウザ内に保存します。ほかの端末との同期はありません。'
    : storageProblem === 'changed'
      ? '別のタブなどで保存データが変更されたため、上書きを止めています。現在のタブの変更は自動では反映されません。'
      : storageProtected && storageProblem !== 'unavailable'
        ? '保存データの一部を読み込めませんでした。読み取れる項目だけを表示し、元のデータは変更せずに残しています。'
        : storageProblem === 'unavailable'
          ? 'ブラウザの保存領域を読み取れません。保存済みの内容は確認できず、このタブだけで利用しています。'
          : '変更を保存できませんでした。最後に保存できたデータはそのまま残し、変更はこのタブだけで保持しています。'
  return (
    <section className="storage-details">
      <SectionHeading title="端末内の保存" />
      <div className={storageProblem ? 'notice' : 'body-copy'}>{description}</div>
      {storageProblem && (
        <>
          <p className="body-copy">
            再読み込みすると、このタブだけの変更は失われます。大切な入力は手元に控えてから操作してください。
          </p>
          {!storageProtected && (
            <PrimaryButton onClick={retryStorage}>保存をもう一度試す</PrimaryButton>
          )}
          <PrimaryButton variant="secondary" onClick={downloadStoredData}>
            保存されている元データをダウンロード
          </PrimaryButton>
          <p className="muted small">
            相談メモなどを含むJSONファイルです。自分の端末で保管してください。このタブだけの変更は含みません。自動の修復・取り込みは行いません。
          </p>
          <p className="body-copy">
            読み直す場合はブラウザを再読み込みしてください。すべて消してやり直す場合は、下の「モックの保存データを削除」から確認できます。
          </p>
        </>
      )}
    </section>
  )
}
