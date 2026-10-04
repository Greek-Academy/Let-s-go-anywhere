import { firebasePilot } from '../firebase/config'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Heart, ImageOff, Users } from 'lucide-react'
import { BottomSheet, Chip, PrimaryButton, Tag } from '../components/ui'
import { OutingImage, OutingPhotoCredit, OutingStatus } from '../components/OutingStatus'
import { useContent } from '../content/ContentProvider'
import { useApp } from '../state/AppState'
import { actors } from './model'
import type { Candidate } from './model'
import { useSharing } from './SharingProvider'
import { canRead } from './domain'

export function SharingStatus() {
  const { error, pending, refresh } = useSharing()
  return (
    <>
      {pending && (
        <p className="small muted" role="status">
          処理中…
        </p>
      )}
      {error && (
        <div className="sharing-error" role="alert">
          <p>{error}</p>
          <p className="small">保存済みのデータは上書きしていません。</p>
          <button className="text-button" onClick={() => void refresh()} disabled={pending}>
            最新の内容を読み直す
          </button>
        </div>
      )}
    </>
  )
}
export function DemoNotice({ switcher = true }: { switcher?: boolean }) {
  const { actor, setActor, pending } = useSharing()
  const navigate = useNavigate()
  return (
    <aside className="sharing-demo">
      <strong>この端末だけの共有体験デモ</strong>
      <p>別のスマホへの送信・同期はまだ行いません。</p>
      {switcher && (
        <div className="sharing-actors" aria-label="デモの操作役">
          {(Object.keys(actors) as (keyof typeof actors)[]).map((id) => (
            <Chip
              key={id}
              selected={actor === id}
              disabled={pending}
              onClick={() => {
                setActor(id)
                navigate('/saved/lists', { replace: true })
              }}
            >
              {actors[id]}として試す
            </Chip>
          ))}
        </div>
      )}
    </aside>
  )
}
export function PrivateListSelector() {
  const navigate = useNavigate()
  const { setActor } = useSharing()
  return (
    <button
      className="sharing-selector"
      onClick={() => {
        setActor('self')
        navigate(firebasePilot ? '/saved/cloud' : '/saved/lists')
      }}
      aria-label="リストを切り替える"
    >
      <span className="round-icon">
        <Heart size={21} />
      </span>
      <span>
        <strong>私の行きたい</strong>
        <small>自分だけの保存リスト</small>
      </span>
      <ChevronDown size={18} />
    </button>
  )
}
export function CandidatePreview({
  candidate,
  photo = true,
}: {
  candidate: Candidate
  photo?: boolean
}) {
  const { outings } = useContent()
  const outing =
    candidate.kind === 'catalog' ? outings.find((o) => o.id === candidate.catalogId) : undefined
  return (
    <div className="sharing-candidate">
      {photo && (
        <div className="sharing-photo">
          {outing ? (
            <OutingImage outing={outing} decorative />
          ) : (
            <span className="sharing-placeholder">
              <ImageOff size={26} />
              <span>写真は未取得です</span>
            </span>
          )}
        </div>
      )}
      <div className="sharing-candidate-body">
        {outing ? <OutingStatus outing={outing} /> : <Tag tone="peach">{candidate.status}</Tag>}
        <h3>{candidate.title}</h3>
        {candidate.area && <p className="small muted">{candidate.area}</p>}
        {outing && <OutingPhotoCredit outing={outing} />}
        {candidate.url && <p className="link-url">{candidate.url}</p>}
      </div>
    </div>
  )
}
export function ShareCandidateButton({ candidate }: { candidate: Candidate }) {
  const navigate = useNavigate()
  const { memoryOnly } = useApp()
  const [open, setOpen] = useState(false)
  const { setActor } = useSharing()
  return (
    <>
      <PrimaryButton
        icon={Users}
        variant="secondary"
        onClick={() => {
          if (firebasePilot && !memoryOnly) {
            navigate('/saved/cloud', { state: { candidate } })
            return
          }
          setActor('self')
          setOpen(true)
        }}
      >
        共有リストに追加
      </PrimaryButton>
      {open && <ShareCandidateSheet candidate={candidate} onClose={() => setOpen(false)} />}
    </>
  )
}
export function ShareCandidateSheet({
  candidate,
  listId,
  onClose,
}: {
  candidate: Candidate
  listId?: string
  onClose: () => void
}) {
  const { state, actor, pending, ready, run } = useSharing()
  const [selected, setSelected] = useState(listId ?? '')
  const [note, setNote] = useState('')
  const navigate = useNavigate()
  const { toast } = useApp()
  const lists = state.lists.filter((l) => canRead(l, actor))
  // The exact snapshot displayed here is the one stored; do not copy all personal app state.
  return (
    <BottomSheet title="共有する内容を確認" onClose={onClose}>
      <DemoNotice switcher={false} />
      <p className="body-copy">
        選んだ候補と、ここで書く共有メモだけを追加します。個人メモ・学習記録・運転の不安は含めません。
      </p>
      <CandidatePreview candidate={candidate} photo={false} />
      <p className="small muted">
        {candidate.kind === 'web' ? '検索日時' : '候補を取り出した日時'}：
        {new Date(candidate.capturedAt).toLocaleString('ja-JP')}。最新情報の確認日ではありません。
      </p>
      <label className="field-label">
        追加先のリスト
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={!!listId || pending}
        >
          <option value="">リストを選んでください</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        共有メモ（任意）
        <textarea
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="みんなに伝えたいことだけを書きましょう"
        />
      </label>
      <p className="small muted">
        タイトルやURLに個人情報が含まれていないか確認してください。元の個人保存はそのまま残ります。
      </p>
      <SharingStatus />
      <PrimaryButton
        disabled={!selected || pending || !ready}
        onClick={async () => {
          const result = await run({ type: 'add', listId: selected, candidate, note })
          if (!result) return
          toast(result.duplicate ? 'この候補は追加済みです' : '共有デモのリストに追加しました')
          onClose()
          navigate(`/saved/lists/${result.listId}/items/${result.itemId}`)
        }}
      >
        この内容をリストに追加
      </PrimaryButton>
      {!lists.length && (
        <PrimaryButton
          variant="secondary"
          onClick={() => {
            onClose()
            navigate('/saved/lists/new')
          }}
        >
          先に共有リストを作る
        </PrimaryButton>
      )}
    </BottomSheet>
  )
}
