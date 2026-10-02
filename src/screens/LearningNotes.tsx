import { BookOpen, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Header, PrimaryButton, useBack } from '../components/ui'
import { useApp } from '../state/AppState'

/** Reuse the v1 questions field so existing personal notes remain readable. */
export function LearningNotes() {
  const { state, update, storageProtected, memoryOnly } = useApp()
  const navigate = useNavigate()
  const goBack = useBack('/learn')
  return (
    <div className="screen">
      <Header back={goBack} title="学習メモ" />
      <div className="page-pad">
        <div className="feature-icon">
          <Pencil size={28} />
        </div>
        <h1>
          気になったことを、
          <br />
          自分の言葉で。
        </h1>
        <p className="body-copy">学習で分からなかったことや、練習で確かめたいことを残せます。</p>
        <label className="field-label">
          自分用の学習メモ
          <textarea
            rows={10}
            maxLength={20000}
            readOnly={storageProtected}
            value={state.memo.questions}
            onChange={(event) =>
              update((current) => ({
                ...current,
                memo: { ...current.memo, questions: event.target.value },
              }))
            }
            placeholder="例：駐車するときの見えにくい場所を、実車で確かめたい。"
          />
        </label>
        <p className="small muted">
          {memoryOnly
            ? '入力内容はこの確認画面を閉じると消えます。'
            : storageProtected
              ? '保存を停止しています。画面上部の保存状態の案内を確認してください。'
              : '入力内容はこの端末に自動保存します。'}
          外部への送信はありません。
        </p>
        <PrimaryButton icon={BookOpen} onClick={() => navigate('/learn')}>
          学ぶに戻る
        </PrimaryButton>
      </div>
    </div>
  )
}
