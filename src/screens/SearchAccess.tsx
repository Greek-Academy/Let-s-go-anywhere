import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FirebasePreparation from './FirebasePreparation'
import { joinPublicSearch } from '../firebase/publicSearch'
import { PrimaryButton } from '../components/ui'

export default function SearchAccess() {
  return (
    <FirebasePreparation purpose="search">
      {(uid, busy) => <Participation key={uid} parentBusy={busy} />}
    </FirebasePreparation>
  )
}
function Participation({ parentBusy }: { parentBusy: boolean }) {
  const [code, setCode] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy || parentBusy || !agreed) return
        setBusy(true)
        setError('')
        try {
          await joinPublicSearch(code.trim())
          navigate('/discover', { replace: true })
        } catch (error) {
          setError(error instanceof Error ? error.message : '参加できませんでした。')
        } finally {
          setBusy(false)
          setCode('')
        }
      }}
    >
      <h2>AI検索の公開テストに参加</h2>
      <p className="body-copy">
        案内された参加コードを入力してください。検索回数の上限はありません。ここではまだ検索しません。
      </p>
      <label className="field-label">
        参加コード
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={64}
          required
          disabled={busy || parentBusy}
        />
      </label>
      <p className="small muted">
        入力した地域・希望をOpenAIとAnthropicへ送信して調べます。検索条件と結果はCloudflareに7日間、本人用として保存します。回数台帳は残ります。保存した好み・学習・現在地・共有相手の情報は自動送信しません。
      </p>
      <p className="small muted">
        検索費用は運営側のAPI利用枠を使います。失敗時も料金が発生する場合があり、自動では再検索しません。結果の再表示・保存・並び替えには追加検索がありません。
      </p>
      <label className="firebase-consent">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={busy || parentBusy}
        />
        <span>検索条件の送信・保存と、検索費用を確認しました</span>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <PrimaryButton type="submit" disabled={!agreed || busy || parentBusy}>
        {busy ? '参加状態を確認中…' : '参加して見つけるへ'}
      </PrimaryButton>
      <p className="small muted">再読み込み後は、ログインと参加コードを入力し直してください。</p>
    </form>
  )
}
