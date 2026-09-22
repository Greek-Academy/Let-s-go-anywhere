import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { PrimaryButton, SectionHeading } from './ui'
import { isNativeApp } from '../platform/runtime'

export function StorageNotice() {
  const { storageProblem, storagePending } = useApp()
  const navigate = useNavigate()
  if (!storageProblem)
    return isNativeApp && storagePending ? (
      <aside className="native-saving" role="status">
        端末に保存中…
      </aside>
    ) : null
  return (
    <aside className="storage-notice" aria-label="端末内の保存状態">
      <p role="alert">
        自動保存を停止しています。{isNativeApp ? 'アプリを終了' : 'このタブを閉じる'}
        と、ここでの変更は失われます。
      </p>
      <button type="button" onClick={() => navigate('/settings')}>
        保存の状態を確認
      </button>
    </aside>
  )
}

export function StorageDetails() {
  const { storageProblem, storageProtected, retryStorage, downloadStoredData } = useApp()
  const description = isNativeApp
    ? !storageProblem
      ? 'このiPhoneのアプリ内に保存します。ブラウザ版・ほかの端末との同期はありません。アプリを削除するとデータも消えます。'
      : storageProtected
        ? '保存データを読み取れないか変更を検出したため、上書きを停止しています。元データは変更せず、読み取れた項目だけを表示しています。'
        : '変更を保存できませんでした。最後に保存できたデータは残し、新しい変更は起動中のアプリだけで保持しています。'
    : !storageProblem
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
            再読み込み・再起動すると、保存できなかった変更は失われます。大切な入力は手元に控えてから操作してください。
          </p>
          {!storageProtected && (
            <PrimaryButton onClick={retryStorage}>保存をもう一度試す</PrimaryButton>
          )}
          <PrimaryButton variant="secondary" onClick={downloadStoredData}>
            {isNativeApp
              ? '保存されている元データを共有・コピー'
              : '保存されている元データをダウンロード'}
          </PrimaryButton>
          <p className="muted small">
            相談メモなどを含むJSON
            {isNativeApp
              ? 'テキストです。共有画面の「コピー」などで手元に控えてください。共有先へ渡す内容を確認してください。'
              : 'ファイルです。自分の端末で保管してください。'}
            保存されていない変更は含みません。自動の修復・取り込みは行いません。
          </p>
          <p className="body-copy">
            読み直す場合は{isNativeApp ? 'アプリを終了・再起動' : 'ブラウザを再読み込み'}
            してください。すべて消してやり直す場合は、下の「モックの保存データを削除」から確認できます。
          </p>
        </>
      )}
    </section>
  )
}
