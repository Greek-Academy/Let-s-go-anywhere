import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Check, Copy, Heart, Link2, Plus, RefreshCw, Settings, Share2, Users } from 'lucide-react'
import { Share } from '@capacitor/share'
import FirebasePreparation from './FirebasePreparation'
import { BottomSheet, Chip, EmptyState, Modal, PrimaryButton, Tag } from '../components/ui'
import { ExternalModal } from '../components/ExternalLinkModal'
import { useApp } from '../state/AppState'
import { useContent } from '../content/ContentProvider'
import { isNativeApp } from '../platform/runtime'
import { firebasePilot } from '../firebase/config'
import { getFirebaseClient } from '../firebase/client'
import { draftRepository } from '../firebase/drafts'
import type { CloudDraft } from '../firebase/drafts'
import { useCloud, useCloudList } from '../firebase/sharing/useCloud'
import { expiresAt, invitePath, inviteUrl, parseInvite } from '../firebase/sharing/model'
import type { CloudInvite, CloudItem, CloudList } from '../firebase/sharing/model'
import { CandidatePreview } from '../sharing/components'
import { fromLink, fromOuting, fromWebSpot } from '../sharing/candidates'
import { checkCandidateFields } from '../sharing/codec'
import { validateCandidate } from '../sharing/domain'
import { colors, reactions } from '../sharing/model'
import type { Candidate, Color } from '../sharing/model'
import { normalizeSavedUrl, savedUrlKey } from '../domain/savedUrls'
import '../sharing/sharing.css'
import '../firebase/sharing/sharing.css'

const path = (id: string) => `/saved/cloud/list/${id}`
const time = (ms: number) =>
  new Date(ms).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="sharing-error" role="alert">
      {text}
    </p>
  ) : null
}
function useIncoming() {
  const { state } = useLocation()
  try {
    const c = state?.candidate
    if (c) {
      checkCandidateFields(c)
      validateCandidate(c)
      return c as Candidate
    }
  } catch {
    /* Untrusted navigation state is not uploaded. */
  }
  return undefined
}
function ColorPicker({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className="sharing-colors" aria-label="リストの色">
      {Object.entries(colors).map(([c, label]) => (
        <Chip
          key={c}
          className={`sharing-color-${c}`}
          selected={value === c}
          onClick={() => onChange(c as Color)}
        >
          {label}
        </Chip>
      ))}
    </div>
  )
}
export default function CloudSharing() {
  return (
    <FirebasePreparation shared>
      {(uid, busy) => (
        <fieldset className="cloud-session" disabled={busy} key={uid}>
          <Routes>
            <Route index element={<CloudHub uid={uid} />} />
            <Route path="list/:listId" element={<CloudListPage uid={uid} />} />
            <Route path="list/:listId/item/:itemId" element={<CloudListPage uid={uid} />} />
            <Route path="invite/:listId/:token" element={<CloudInvitation uid={uid} />} />
            <Route path="*" element={<Navigate to="/saved/cloud" replace />} />
          </Routes>
        </fieldset>
      )}
    </FirebasePreparation>
  )
}
function CloudHub({ uid }: { uid: string }) {
  const cloud = useCloud(uid),
    navigate = useNavigate(),
    incoming = useIncoming()
  const [lists, setLists] = useState<CloudList[]>([]),
    [ready, setReady] = useState(false)
  const [create, setCreate] = useState(false),
    [joining, setJoining] = useState(false),
    [link, setLink] = useState(''),
    [invalid, setInvalid] = useState(false)
  const refresh = async () => {
    setLists([])
    setReady(false)
    const r = await cloud.run(() => cloud.repo.lists())
    if (r) {
      setLists(r.value)
      setReady(true)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  return (
    <>
      <p className="eyebrow teal">OUR NEXT DAY OFF</p>
      <h1>
        次の「行きたい」を、
        <br />
        一緒に。
      </h1>
      <p className="body-copy">
        一人で準備して、誘いたくなったら招待。個人の保存は自分だけのままです。
      </p>
      <Tag>Firebaseで共有する検証版</Tag>
      {incoming && (
        <aside className="firebase-message">
          「{incoming.title}」を追加するリストを選んでください。選択だけでは送信しません。
        </aside>
      )}
      <button className="sharing-selector" onClick={() => navigate('/saved')}>
        <Heart size={22} />
        <span>
          <strong>私の行きたい</strong>
          <small>この端末の自分だけの保存</small>
        </span>
      </button>
      <div className="sharing-toolbar">
        <h2>参加しているリスト</h2>
        <button
          className="icon-button"
          aria-label="リストを更新"
          disabled={cloud.busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={19} />
        </button>
      </div>
      <ErrorText text={cloud.error} />
      {cloud.busy && <p role="status">保存先と通信中…</p>}
      {lists.map((l) => (
        <button
          className={`sharing-list-tile sharing-color-${l.color}`}
          key={l.id}
          onClick={() => navigate(path(l.id), { state: incoming ? { candidate: incoming } : null })}
        >
          <Users size={24} />
          <span>
            <strong>{l.name}</strong>
            <small>
              {l.memberIds.length}人・{l.itemCount}候補{' '}
              {l.status !== 'active' ? '・整理が必要です' : ''}
            </small>
          </span>
        </button>
      ))}
      {ready && !lists.length && (
        <EmptyState
          title="最初のリストを作ろう"
          description="例：ふたりの休日、友だちとの旅行。まだ誰も招待せず、一人で候補を準備できます。"
        />
      )}
      <PrimaryButton icon={Plus} disabled={!ready || cloud.busy} onClick={() => setCreate(true)}>
        新しい共有リストを作る
      </PrimaryButton>
      <PrimaryButton icon={Link2} variant="secondary" onClick={() => setJoining(true)}>
        招待リンクから参加する
      </PrimaryButton>
      <button className="text-button" onClick={() => navigate('/saved/cloud/preparation')}>
        前回の本人用準備リストを見る
      </button>
      {create && (
        <CreateCloudList
          uid={uid}
          onClose={() => setCreate(false)}
          onCreated={(id) =>
            navigate(path(id), { state: incoming ? { candidate: incoming } : null })
          }
        />
      )}
      {joining && (
        <BottomSheet title="受け取った招待リンク" onClose={() => setJoining(false)}>
          <p className="body-copy">
            LINEなどで受け取ったリンクを貼り付けてください。確認後に参加を申請します。
          </p>
          <label className="field-label">
            招待リンク
            <input
              value={link}
              onChange={(e) => {
                setLink(e.target.value)
                setInvalid(false)
              }}
              autoCapitalize="none"
            />
          </label>
          {invalid && <ErrorText text="Drive+の招待リンクを確認してください。" />}
          <PrimaryButton
            onClick={() => {
              const v = parseInvite(link)
              if (!v) {
                setInvalid(true)
                return
              }
              navigate(invitePath(v.listId, v.token))
            }}
          >
            招待を確認
          </PrimaryButton>
        </BottomSheet>
      )}
    </>
  )
}
function CreateCloudList({
  uid,
  onClose,
  onCreated,
}: {
  uid: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const cloud = useCloud(uid),
    [name, setName] = useState(''),
    [color, setColor] = useState<Color>('teal'),
    [displayName, setDisplayName] = useState('')
  const [drafts, setDrafts] = useState<CloudDraft[]>([]),
    [draftId, setDraftId] = useState('')
  useEffect(() => {
    let alive = true
    void draftRepository(getFirebaseClient().db, uid)
      .read()
      .then((d) => {
        if (alive) setDrafts(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [uid])
  return (
    <BottomSheet title="新しい共有リスト" onClose={() => !cloud.busy && onClose()}>
      <p className="body-copy">
        名前と色、リストで使う表示名をFirebaseに保存します。メールアドレスは相手に表示しません。
      </p>
      {drafts.length > 0 && (
        <label className="field-label">
          前回の準備リストから名前と色をコピー
          <select
            value={draftId}
            onChange={(e) => {
              setDraftId(e.target.value)
              const d = drafts.find((x) => x.id === e.target.value)
              if (d) {
                setName(d.name)
                setColor(d.color)
              }
            }}
          >
            <option value="">新しく入力する</option>
            {drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <small>選んだ名前と色だけを使い、元の本人用リストは残します。</small>
        </label>
      )}
      <label className="field-label">
        リストの名前
        <input
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ふたりの休日"
        />
      </label>
      <ColorPicker value={color} onChange={setColor} />
      <label className="field-label">
        このリストでの表示名
        <input
          maxLength={30}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="相手に分かるニックネーム"
        />
      </label>
      <p className="small muted">
        作成は3枠、参加者は1リスト5人、候補は100件まで。個人の保存・学習・不安・現在地を自動で追加しません。
      </p>
      <ErrorText text={cloud.error} />
      <PrimaryButton
        disabled={cloud.busy || !name.trim() || !displayName.trim()}
        onClick={async () => {
          const r = await cloud.run(() =>
            cloud.repo.create(
              name,
              color,
              displayName,
              drafts.find((d) => d.id === draftId),
            ),
          )
          if (r) onCreated(r.value)
        }}
      >
        {cloud.busy ? '作成中…' : 'この内容で共有リストを作る'}
      </PrimaryButton>
    </BottomSheet>
  )
}
function CloudListPage({ uid }: { uid: string }) {
  const { listId = '', itemId } = useParams(),
    navigate = useNavigate(),
    incoming = useIncoming(),
    cloud = useCloudList(uid, listId)
  const [add, setAdd] = useState(!!incoming),
    [settings, setSettings] = useState(false),
    [inviteOpen, setInviteOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'both' | 'unanswered'>('all')
  const [confirm, setConfirm] = useState<{
    title: string
    text: string
    run: () => Promise<void>
    leave?: boolean
  } | null>(null)
  const [editing, setEditing] = useState<CloudItem | null>(null),
    [note, setNote] = useState('')
  const [external, setExternal] = useState<Candidate | null>(null)
  if (!cloud.data)
    return (
      <>
        <button className="text-button" onClick={() => navigate('/saved/cloud', { replace: true })}>
          リスト一覧に戻る
        </button>
        {cloud.loading ? (
          <p role="status">共有リストを確認中…</p>
        ) : (
          <>
            <EmptyState
              title="共有リストを表示できません"
              description="通信状態、参加の承認、退出・削除の状態を確認してください。前の内容は表示していません。"
            />
            <ErrorText text={cloud.readError} />
            <PrimaryButton variant="secondary" onClick={cloud.refresh}>
              もう一度確認する
            </PrimaryButton>
          </>
        )}
      </>
    )
  const { list, items, invite } = cloud.data,
    owner = list.ownerId === uid
  const execute = async (action: () => Promise<void>, leave = false) => {
    const r = await cloud.run(action)
    if (r) {
      setConfirm(null)
      setEditing(null)
      if (leave) navigate('/saved/cloud', { replace: true })
      else cloud.refresh()
    }
  }
  const allInterested = (i: CloudItem) =>
    list.memberIds.length >= 2 &&
    list.memberIds.every((m) => ['want', 'interested'].includes(i.reactions[m] ?? ''))
  const visible = items.filter(
    (i) =>
      filter === 'all' ||
      (filter === 'both' ? allInterested(i) : list.memberIds.some((m) => !i.reactions[m])),
  )
  const selected = itemId ? items.find((i) => i.id === itemId) : null
  return (
    <>
      <button
        className="text-button"
        onClick={() => navigate(itemId ? path(list.id) : '/saved/cloud')}
      >
        {itemId ? 'リストに戻る' : 'リスト一覧へ'}
      </button>
      <div className="sharing-toolbar">
        <h1>{list.name}</h1>
        {!itemId && (
          <button
            className="icon-button"
            aria-label="メンバーと設定"
            onClick={() => setSettings(true)}
          >
            <Settings size={21} />
          </button>
        )}
      </div>
      <p className="small muted">
        {list.memberIds.map((m) => `${list.members[m]}${m === uid ? '（あなた）' : ''}`).join('・')}{' '}
        ／ {list.memberIds.length}人
      </p>
      <ErrorText text={cloud.error} />
      <PrimaryButton icon={RefreshCw} variant="ghost" disabled={cloud.busy} onClick={cloud.refresh}>
        最新の内容に更新
      </PrimaryButton>
      {list.status !== 'active' ? (
        <aside className="firebase-message">
          <h2>
            {list.status === 'deleting' ? '削除処理中です' : '退出後のデータを整理しています'}
          </h2>
          <p>共有内容の操作を停止しています。途中で閉じても作成者が処理を再開できます。</p>
          {owner && (
            <PrimaryButton
              disabled={cloud.busy}
              onClick={() =>
                void execute(() => cloud.repo.resume(list.id), list.status === 'deleting')
              }
            >
              処理を再開する
            </PrimaryButton>
          )}
        </aside>
      ) : (
        <>
          {!itemId && (
            <>
              {owner && invite?.status === 'requested' && (
                <aside className="firebase-message">
                  <strong>{invite.applicantName}さんから参加申請</strong>
                  <p>
                    表示名だけでは本人か判断できません。リンクを送った相手か、LINE等でも確認してください。
                  </p>
                  <PrimaryButton
                    disabled={cloud.busy || expiresAt(invite) < Date.now()}
                    onClick={() =>
                      setConfirm({
                        title: '参加を承認しますか？',
                        text: `${invite.applicantName}さんに、このリストの候補・共有メモ・参加者の表示名・反応が見えるようになります。`,
                        run: () => cloud.repo.approve(list.id, invite.id),
                      })
                    }
                  >
                    申請した人を確認して承認
                  </PrimaryButton>
                </aside>
              )}
              {owner && (
                <PrimaryButton
                  icon={Share2}
                  variant="secondary"
                  disabled={cloud.busy || list.memberIds.length >= 5}
                  onClick={() => setInviteOpen(true)}
                >
                  メンバーを招待する
                </PrimaryButton>
              )}
              <div className="chip-row cloud-filters">
                <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
                  すべて
                </Chip>
                {list.memberIds.length >= 2 && (
                  <Chip selected={filter === 'both'} onClick={() => setFilter('both')}>
                    {list.memberIds.length === 2 ? '二人とも興味あり' : 'みんなが興味あり'}
                  </Chip>
                )}
                <Chip selected={filter === 'unanswered'} onClick={() => setFilter('unanswered')}>
                  未回答あり
                </Chip>
              </div>
              {!visible.length && (
                <EmptyState
                  title={
                    items.length ? 'この条件の候補はありません' : '最初の「行きたい」を持ち寄ろう'
                  }
                  description="自分の保存から選ぶか、気になる場所のリンクを追加できます。"
                />
              )}
              {visible.map((i) => (
                <article key={i.id} className="cloud-candidate-card">
                  <button
                    className="cloud-card-open"
                    onClick={() => navigate(`${path(list.id)}/item/${i.id}`)}
                    aria-label={`${i.candidate.title}の詳細`}
                  >
                    <CandidatePreview candidate={i.candidate} />
                  </button>
                  <div className="cloud-card-bottom">
                    <Reactions
                      uid={uid}
                      list={list}
                      item={i}
                      busy={cloud.busy}
                      onReact={(r) =>
                        void execute(() =>
                          cloud.repo.react(list.id, i.id, r, i.reactions[uid] ?? null),
                        )
                      }
                    />
                  </div>
                </article>
              ))}
              <PrimaryButton
                icon={Plus}
                disabled={cloud.busy || items.length >= 100}
                onClick={() => setAdd(true)}
              >
                候補を追加する
              </PrimaryButton>
            </>
          )}
          {itemId &&
            (selected ? (
              <>
                <CandidatePreview candidate={selected.candidate} />
                <p className="small muted">
                  {selected.authorId === null
                    ? '退出したメンバー'
                    : (list.members[selected.authorId] ?? 'メンバー')}
                  が追加
                </p>
                <p className="small muted">
                  情報を取り出した日時：{time(Date.parse(selected.candidate.capturedAt))}
                  。施設の最新情報を確認した日時ではありません。
                </p>
                {selected.note && (
                  <div className="firebase-message">
                    <h3>共有メモ</h3>
                    <p className="cloud-note">{selected.note}</p>
                  </div>
                )}
                <Reactions
                  uid={uid}
                  list={list}
                  item={selected}
                  busy={cloud.busy}
                  onReact={(r) =>
                    void execute(() =>
                      cloud.repo.react(list.id, selected.id, r, selected.reactions[uid] ?? null),
                    )
                  }
                />
                {selected.candidate.url && (
                  <PrimaryButton
                    variant="secondary"
                    onClick={() => setExternal(selected.candidate)}
                  >
                    出典・元のページを確認
                  </PrimaryButton>
                )}
                <SavePersonally candidate={selected.candidate} />
                {(selected.authorId === uid || (selected.authorId === null && owner)) && (
                  <PrimaryButton
                    variant="secondary"
                    onClick={() => {
                      setEditing(selected)
                      setNote(selected.note)
                    }}
                  >
                    共有メモを編集
                  </PrimaryButton>
                )}
                {(selected.authorId === uid || owner) && (
                  <button
                    className="text-button danger"
                    onClick={() =>
                      setConfirm({
                        title: 'この候補を共有リストから外す',
                        text: '共有メモと全員の反応も削除します。各自の個人保存は残ります。',
                        run: async () => {
                          await cloud.repo.removeItem(list.id, selected)
                          navigate(path(list.id), { replace: true })
                        },
                      })
                    }
                  >
                    共有リストから削除
                  </button>
                )}
              </>
            ) : (
              <EmptyState
                title="この候補は削除されました"
                description="リストに戻って、最新の候補を確認してください。"
              />
            ))}
        </>
      )}
      <p className="small muted cloud-footnote">
        相手の変更は「最新の内容に更新」で確認できます。反応は興味の表明で、運転の引き受けや安全性の判定ではありません。
      </p>
      {add && list.status === 'active' && (
        <AddCloudCandidate
          uid={uid}
          list={list}
          initial={incoming}
          onClose={() => setAdd(false)}
          onAdded={(id) => {
            setAdd(false)
            navigate(`${path(list.id)}/item/${id}`, { replace: true, state: null })
            cloud.refresh()
          }}
        />
      )}
      {inviteOpen && owner && (
        <InviteSheet
          uid={uid}
          list={list}
          invite={invite}
          onClose={() => setInviteOpen(false)}
          onChanged={cloud.refresh}
        />
      )}
      {settings && (
        <BottomSheet title="メンバーと設定" onClose={() => setSettings(false)}>
          <h2>{list.name}</h2>
          <p className="body-copy">候補と共有メモ・反応は参加者だけに表示されます。</p>
          {list.memberIds.map((m) => (
            <div className="cloud-member" key={m}>
              <div>
                <strong>{list.members[m]}</strong>
                <small>
                  {m === uid ? 'あなた・' : ''}
                  {m === list.ownerId ? '作成者' : '参加メンバー'}
                </small>
              </div>
              {owner && m !== uid && list.status === 'active' && (
                <div>
                  <button
                    className="text-button"
                    onClick={() =>
                      setConfirm({
                        title: '作成者を引き継いでもらう',
                        text: `${list.members[m]}さんが承諾すると、招待や参加承認などを担当する作成者になります。今の招待リンクは無効になります。`,
                        run: () => cloud.repo.transfer(list.id, m, list.revision),
                      })
                    }
                  >
                    引き継ぎを依頼
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      setConfirm({
                        title: 'メンバーを外す',
                        text: `${list.members[m]}さんはこのリストを開けなくなります。追加した候補は残し、反応と追加者IDは整理します。`,
                        run: () => cloud.repo.removeMember(list.id, m, list.revision),
                      })
                    }
                  >
                    外す
                  </button>
                </div>
              )}
            </div>
          ))}
          {list.successorId && (
            <aside className="firebase-message">
              {list.members[list.successorId]}さんへ引き継ぎを依頼中です。
              {list.successorId === uid && (
                <PrimaryButton
                  disabled={cloud.busy}
                  onClick={() =>
                    void execute(() => cloud.repo.transfer(list.id, uid, list.revision, true))
                  }
                >
                  作成者の引き継ぎを承諾
                </PrimaryButton>
              )}
              {owner && (
                <button
                  className="text-button"
                  onClick={() =>
                    void execute(() => cloud.repo.transfer(list.id, null, list.revision))
                  }
                >
                  引き継ぎ依頼を取り消す
                </button>
              )}
            </aside>
          )}
          <ErrorText text={cloud.error} />
          {owner && list.status === 'active' && (
            <RenameList list={list} uid={uid} onDone={cloud.refresh} />
          )}
          {owner ? (
            <>
              <PrimaryButton
                variant="danger"
                disabled={cloud.busy}
                onClick={() =>
                  setConfirm({
                    title: 'リスト全体を削除する',
                    text: '全員の候補・共有メモ・反応・招待をFirebaseから削除します。個人の保存は残ります。途中で通信が切れた場合は作成者が削除を再開できます。',
                    run: () => cloud.repo.beginDelete(list.id, list.revision),
                    leave: true,
                  })
                }
              >
                共有リスト全体を削除
              </PrimaryButton>
              <p className="small muted">
                他の人を残して退出する場合は、先に作成者を引き継ぎ、相手の承諾を待ってください。
              </p>
            </>
          ) : (
            <PrimaryButton
              variant="danger"
              disabled={cloud.busy || list.status !== 'active'}
              onClick={() =>
                setConfirm({
                  title: 'リストから退出する',
                  text: '追加した候補はリストに残ります。以後の閲覧・変更はできなくなり、作成者側で反応と追加者IDの整理を行います。個人保存は残ります。',
                  run: () => cloud.repo.removeMember(list.id, uid, list.revision),
                  leave: true,
                })
              }
            >
              このリストから退出
            </PrimaryButton>
          )}
        </BottomSheet>
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => !cloud.busy && setConfirm(null)}>
          <p className="body-copy">{confirm.text}</p>
          <ErrorText text={cloud.error} />
          <PrimaryButton
            disabled={cloud.busy}
            onClick={() => void execute(confirm.run, confirm.leave)}
          >
            確認して実行
          </PrimaryButton>
          <PrimaryButton variant="secondary" disabled={cloud.busy} onClick={() => setConfirm(null)}>
            キャンセル
          </PrimaryButton>
        </Modal>
      )}
      {editing && (
        <BottomSheet title="共有メモを編集" onClose={() => !cloud.busy && setEditing(null)}>
          <label className="field-label">
            共有メモ
            <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </label>
          <ErrorText text={cloud.error} />
          <PrimaryButton
            disabled={cloud.busy}
            onClick={() => void execute(() => cloud.repo.editItem(list.id, editing, note))}
          >
            共有メモを保存
          </PrimaryButton>
        </BottomSheet>
      )}
      {external?.url && (
        <ExternalModal
          title={external.title}
          request={{ type: 'personal', url: external.url }}
          onClose={() => setExternal(null)}
        />
      )}
    </>
  )
}
function Reactions({
  uid,
  list,
  item,
  busy,
  onReact,
}: {
  uid: string
  list: CloudList
  item: CloudItem
  busy: boolean
  onReact: (r: keyof typeof reactions | null) => void
}) {
  return (
    <div className="cloud-reactions">
      <div className="cloud-reaction-summary">
        {list.memberIds.map((m) => (
          <p key={m}>
            <strong>{m === uid ? 'あなた' : list.members[m]}</strong>
            <span>{reactions[item.reactions[m]] ?? '未回答'}</span>
          </p>
        ))}
      </div>
      <p className="small muted">自分の反応を選ぶ（相手にも見えます）</p>
      <div className="chip-row">
        {Object.entries(reactions).map(([r, label]) => (
          <Chip
            key={r}
            disabled={busy}
            selected={item.reactions[uid] === r}
            onClick={() =>
              onReact(item.reactions[uid] === r ? null : (r as keyof typeof reactions))
            }
          >
            {label}
          </Chip>
        ))}
      </div>
      <p className="small muted">選択中の反応をもう一度押すと未回答に戻ります。</p>
    </div>
  )
}
function RenameList({ list, uid, onDone }: { list: CloudList; uid: string; onDone: () => void }) {
  const cloud = useCloud(uid),
    [name, setName] = useState(list.name),
    [color, setColor] = useState(list.color)
  return (
    <section>
      <label className="field-label">
        リスト名の変更
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <ColorPicker value={color} onChange={setColor} />
      <ErrorText text={cloud.error} />
      <PrimaryButton
        variant="secondary"
        disabled={cloud.busy || !name.trim()}
        onClick={async () => {
          if (await cloud.run(() => cloud.repo.rename(list.id, list.revision, name, color)))
            onDone()
        }}
      >
        名前と色を変更
      </PrimaryButton>
    </section>
  )
}
function InviteSheet({
  uid,
  list,
  invite,
  onClose,
  onChanged,
}: {
  uid: string
  list: CloudList
  invite: CloudInvite | null
  onClose: () => void
  onChanged: () => void
}) {
  const cloud = useCloud(uid),
    [issued, setIssued] = useState(invite),
    [copied, setCopied] = useState(false)
  const url = issued ? inviteUrl(list.id, issued.id, firebasePilot?.mode === 'emulator') : ''
  const usable =
    issued &&
    ['open', 'requested'].includes(issued.status) &&
    expiresAt(issued) > Date.now() &&
    list.currentInvite === issued.id
  return (
    <BottomSheet title="メンバーを招待" onClose={() => !cloud.busy && onClose()}>
      <p className="body-copy">
        7日間有効・1人分のリンクです。相手が参加を申請し、あなたが承認すると、このリストの候補が見えるようになります。
      </p>
      <p className="small muted">
        リンクは信頼できる相手に送ってください。メールアドレス・個人の保存一覧・学習情報は共有しません。
      </p>
      {issued && (
        <>
          <Tag>
            {usable
              ? '有効な招待'
              : issued.status === 'used'
                ? '承認済みの招待'
                : '利用できない招待'}
          </Tag>
          <p className="small muted">期限：{time(expiresAt(issued))}</p>
          {usable && (
            <>
              <label className="field-label">
                共有する招待リンク
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <PrimaryButton
                icon={Share2}
                onClick={async () => {
                  await cloud.run(async () => {
                    if (isNativeApp)
                      await Share.share({
                        title: 'Drive+の行きたいリスト',
                        text: `「${list.name}」への招待です。`,
                        url,
                      })
                    else if (navigator.share)
                      await navigator.share({ title: 'Drive+の行きたいリスト', url })
                    else {
                      await navigator.clipboard.writeText(url)
                      setCopied(true)
                    }
                  })
                }}
              >
                共有メニューを開く
              </PrimaryButton>
              <PrimaryButton
                icon={copied ? Check : Copy}
                variant="secondary"
                onClick={async () => {
                  if (await cloud.run(() => navigator.clipboard.writeText(url))) setCopied(true)
                }}
              >
                {copied ? 'コピーしました' : '招待リンクをコピー'}
              </PrimaryButton>
              <PrimaryButton
                variant="secondary"
                disabled={cloud.busy}
                onClick={async () => {
                  if (await cloud.run(() => cloud.repo.revoke(list.id, issued.id))) {
                    setIssued(null)
                    onChanged()
                  }
                }}
              >
                この招待を取り消す
              </PrimaryButton>
            </>
          )}
        </>
      )}
      <ErrorText text={cloud.error} />
      <PrimaryButton
        disabled={cloud.busy}
        onClick={async () => {
          const r = await cloud.run(async () => {
            const t = await cloud.repo.invite(list.id)
            return cloud.repo.invitation(list.id, t)
          })
          if (r) {
            setIssued(r.value)
            setCopied(false)
            onChanged()
          }
        }}
      >
        {issued ? '新しい招待リンクを発行' : '招待リンクを発行'}
      </PrimaryButton>
      {issued && (
        <p className="small muted">再発行すると以前のリンク・未承認の申請は使えなくなります。</p>
      )}
    </BottomSheet>
  )
}
function CloudInvitation({ uid }: { uid: string }) {
  const { listId = '', token = '' } = useParams(),
    cloud = useCloud(uid),
    navigate = useNavigate()
  const [invite, setInvite] = useState<CloudInvite | null>(null),
    [name, setName] = useState(''),
    [agreed, setAgreed] = useState(false),
    [ready, setReady] = useState(false),
    [alreadyJoined, setAlreadyJoined] = useState(false)
  const read = async () => {
    setInvite(null)
    setReady(false)
    setAlreadyJoined(false)
    const r = await cloud.run(async () => {
      const lists = await cloud.repo.lists()
      const joined = lists.some((list) => list.id === listId)
      return { joined, invite: joined ? null : await cloud.repo.invitation(listId, token) }
    })
    if (r) {
      setAlreadyJoined(r.value.joined)
      setInvite(r.value.invite)
      setReady(true)
    }
  }
  useEffect(() => {
    void read()
  }, [listId, token])
  return (
    <>
      <p className="eyebrow teal">LET’S GO TOGETHER</p>
      <h1>
        「行きたい」を、
        <br />
        一緒に持ち寄ろう。
      </h1>
      <ErrorText text={cloud.error} />
      {!ready && (
        <p className="body-copy">
          招待を確認できないときは、通信状態を確認し、招待者に期限・取消の状態を確認してください。
        </p>
      )}
      {alreadyJoined && (
        <>
          <p className="firebase-message">このリストに参加済みです。</p>
          <PrimaryButton onClick={() => navigate(path(listId), { replace: true })}>
            共有リストを開く
          </PrimaryButton>
        </>
      )}
      {invite && (
        <>
          <h2>{invite.listName}</h2>
          <p className="body-copy">招待者：{invite.ownerName}（発行時の表示名）</p>
          <p className="small muted">期限：{time(expiresAt(invite))}</p>
          {invite.status === 'open' && expiresAt(invite) > Date.now() && (
            <>
              <p className="body-copy">
                承認後、このリストの候補・共有メモ・表示名・反応が参加者に見えます。あなたの個人保存・学習・不安・現在地は自動で共有しません。
              </p>
              <label className="field-label">
                このリストでの表示名
                <input maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="firebase-consent">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                共有範囲と、退出後も追加した候補が残ることを確認しました
              </label>
              <PrimaryButton
                disabled={cloud.busy || !name.trim() || !agreed}
                onClick={async () => {
                  if (await cloud.run(() => cloud.repo.request(listId, token, name))) void read()
                }}
              >
                参加をリクエスト
              </PrimaryButton>
            </>
          )}
          {invite.status === 'requested' && (
            <aside className="firebase-message">
              <h2>作成者の承認を待っています</h2>
              <p>
                まだ候補を見ることはできません。相手に申請したことを伝え、承認後に下の更新ボタンを押してください。
              </p>
              <PrimaryButton
                variant="secondary"
                disabled={cloud.busy}
                onClick={async () => {
                  if (await cloud.run(() => cloud.repo.withdraw(listId, token))) void read()
                }}
              >
                参加申請を取り下げる
              </PrimaryButton>
            </aside>
          )}
          {invite.status === 'used' && (
            <>
              <p className="firebase-message">参加が承認されました。</p>
              <PrimaryButton onClick={() => navigate(path(listId), { replace: true })}>
                共有リストを開く
              </PrimaryButton>
            </>
          )}
          {(invite.status === 'revoked' ||
            (invite.status !== 'used' && expiresAt(invite) < Date.now())) && (
            <p className="notice">
              この招待は期限切れ、または取り消し済みです。再発行をお願いしてください。
            </p>
          )}
        </>
      )}
      <PrimaryButton
        icon={RefreshCw}
        variant="secondary"
        disabled={cloud.busy}
        onClick={() => void read()}
      >
        招待の状態を更新
      </PrimaryButton>
      <button className="text-button" onClick={() => navigate('/saved/cloud', { replace: true })}>
        リスト一覧へ
      </button>
    </>
  )
}
function AddCloudCandidate({
  uid,
  list,
  initial,
  onClose,
  onAdded,
}: {
  uid: string
  list: CloudList
  initial?: Candidate
  onClose: () => void
  onAdded: (id: string) => void
}) {
  const cloud = useCloud(uid),
    { state } = useApp(),
    { outings } = useContent()
  const [candidate, setCandidate] = useState<Candidate | undefined>(initial),
    [title, setTitle] = useState(''),
    [url, setUrl] = useState(''),
    [note, setNote] = useState(''),
    [inputError, setInputError] = useState('')
  const options = [
    ...outings.filter((o) => state.savedEvents.includes(o.id)).map((o) => fromOuting(o)),
    ...state.savedWebSpots.map(fromWebSpot),
    ...state.links.map((l) => fromLink(l)),
  ]
  return (
    <BottomSheet
      title={candidate ? '共有する内容を確認' : '候補を持ち寄る'}
      onClose={() => !cloud.busy && onClose()}
    >
      {candidate ? (
        <>
          <p className="body-copy">
            「{list.name}」の参加者に、以下の候補と共有メモだけを送ります。
          </p>
          <CandidatePreview candidate={candidate} photo={false} />
          <p className="small muted">
            情報を取り出した日時：{time(Date.parse(candidate.capturedAt))}
            。最新情報の確認日ではありません。
          </p>
          <label className="field-label">
            共有メモ（任意）
            <textarea
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="みんなに伝えたいことだけ"
            />
          </label>
          <p className="small muted">
            タイトルやURLに個人情報が含まれていないか確認してください。個人メモ・学習・不安・現在地は送信しません。元の個人保存は残ります。
          </p>
          <ErrorText text={cloud.error} />
          <PrimaryButton
            disabled={cloud.busy}
            onClick={async () => {
              const r = await cloud.run(() => cloud.repo.add(list.id, candidate, note))
              if (r) onAdded(r.value.id)
            }}
          >
            {cloud.busy ? '共有中…' : 'この内容を共有リストに追加'}
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            disabled={cloud.busy}
            onClick={() => setCandidate(undefined)}
          >
            選び直す
          </PrimaryButton>
        </>
      ) : (
        <>
          <h3>自分の保存から選ぶ</h3>
          {options.length ? (
            options.map((c, n) => (
              <button
                className="sharing-pick"
                key={n}
                onClick={() => {
                  setCandidate(c)
                  setNote('')
                }}
              >
                <Heart size={18} />
                <span>
                  <strong>{c.title}</strong>
                  <small>{c.status}</small>
                </span>
                <Plus size={18} />
              </button>
            ))
          ) : (
            <p className="small muted">
              このブラウザに保存した候補はありません。公開ページのリンクからも追加できます。
            </p>
          )}
          <h3>リンクと名前を入力</h3>
          <label className="field-label">
            場所の名前
            <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field-label">
            公開ページのURL
            <input
              value={url}
              maxLength={2048}
              onChange={(e) => setUrl(e.target.value)}
              autoCapitalize="none"
              placeholder="https://…"
            />
          </label>
          <ErrorText text={inputError} />
          <PrimaryButton
            disabled={!title.trim() || !url.trim()}
            onClick={() => {
              try {
                setCandidate(fromLink({ title, url }))
                setInputError('')
              } catch (e) {
                setInputError(e instanceof Error ? e.message : 'URLを確認してください。')
              }
            }}
          >
            共有前に内容を確認
          </PrimaryButton>
        </>
      )}
    </BottomSheet>
  )
}
function SavePersonally({ candidate }: { candidate: Candidate }) {
  const { state, update, toast, storageProtected } = useApp(),
    { outings } = useContent()
  const catalog = candidate.kind === 'catalog' && outings.some((o) => o.id === candidate.catalogId)
  return (
    <PrimaryButton
      icon={Heart}
      variant="secondary"
      disabled={storageProtected || (!catalog && !candidate.url)}
      onClick={() => {
        if (catalog) {
          if (!state.savedEvents.includes(candidate.catalogId!))
            update((s) => ({ ...s, savedEvents: [...s.savedEvents, candidate.catalogId!] }))
        } else if (candidate.url) {
          const normalized = normalizeSavedUrl(candidate.url)
          if (!state.links.some((l) => savedUrlKey(l.url) === normalized.key))
            update((s) => ({
              ...s,
              links: [
                ...s.links,
                {
                  id: crypto.randomUUID(),
                  url: normalized.url,
                  title: candidate.title,
                  source: normalized.source,
                  addedAt: new Date().toISOString(),
                },
              ],
            }))
        }
        toast('この端末の「私の行きたい」に保存しました')
      }}
    >
      私の行きたいにも保存
    </PrimaryButton>
  )
}
