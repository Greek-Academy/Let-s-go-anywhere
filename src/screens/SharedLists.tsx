import { useEffect, useState } from 'react'
import { firebasePilot } from '../firebase/config'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  Heart,
  Link2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  BottomSheet,
  Chip,
  EmptyState,
  Header,
  IconButton,
  Modal,
  PrimaryButton,
  Tag,
} from '../components/ui'
import { ExternalModal } from '../components/ExternalLinkModal'
import { useContent, useContentTime } from '../content/ContentProvider'
import { evaluateOuting } from '../domain/outingLifecycle'
import { normalizeSavedUrl, savedUrlKey } from '../domain/savedUrls'
import { useApp } from '../state/AppState'
import { useSharing } from '../sharing/SharingProvider'
import { allInterested, canRead } from '../sharing/domain'
import { fromLink, fromOuting, fromWebSpot } from '../sharing/candidates'
import { actors, colors, reactions } from '../sharing/model'
import type { Actor, Candidate, Color, Command, SharedItem, SharedList } from '../sharing/model'
import {
  CandidatePreview,
  DemoNotice,
  ShareCandidateSheet,
  SharingStatus,
} from '../sharing/components'
import '../sharing/sharing.css'

const listPath = (id: string) => `/saved/lists/${id}`
const formatDate = (date: string | number) =>
  new Date(date).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
function MissingList() {
  const navigate = useNavigate()
  return (
    <>
      <Header back title="共有リスト" />
      <div className="page-pad">
        <DemoNotice />
        <SharingStatus />
        <EmptyState
          icon={Users}
          title="このリストは表示できません"
          description="参加承認前、退出済み、または削除されたリストです。"
          action="リスト一覧へ"
          onAction={() => navigate('/saved/lists', { replace: true })}
        />
      </div>
    </>
  )
}
function ColorPicker({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div className="sharing-colors" role="group" aria-label="リストの色">
      {(Object.keys(colors) as Color[]).map((c) => (
        <Chip
          key={c}
          className={`sharing-color-${c}`}
          selected={value === c}
          onClick={() => onChange(c)}
        >
          {colors[c]}
        </Chip>
      ))}
    </div>
  )
}
export function SharedListHub() {
  const { memoryOnly } = useApp()
  const { state, actor, pending, ready, setActor } = useSharing()
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const lists = state.lists.filter((l) => canRead(l, actor))
  return (
    <div className="screen">
      <Header title="行きたいリスト" back />
      <div className="page-pad">
        <p className="eyebrow teal">A LITTLE MORE TOGETHER</p>
        <h1>
          一人の楽しみも、
          <br />
          みんなの楽しみも。
        </h1>
        <p className="body-copy">誘いたくなったら、新しいリストに「行きたい」を持ち寄ろう。</p>
        {firebasePilot && !memoryOnly && (
          <PrimaryButton variant="secondary" onClick={() => navigate('/saved/cloud')}>
            ログインして相手と共有
          </PrimaryButton>
        )}
        <DemoNotice />
        <SharingStatus />
        <button
          className="sharing-selector"
          onClick={() => {
            setActor('self')
            navigate('/saved')
          }}
        >
          <span className="round-icon">
            <Heart size={21} />
          </span>
          <span>
            <strong>私の行きたい</strong>
            <small>この端末の自分だけの保存</small>
          </span>
          <ChevronDown size={18} />
        </button>
        <h2 className="saved-subheading">
          参加しているリスト <span className="muted">{lists.length}</span>
        </h2>
        {lists.map((l) => (
          <button
            key={l.id}
            className={`sharing-list-tile sharing-color-${l.color}`}
            onClick={() => navigate(listPath(l.id))}
          >
            <span className="round-icon">
              <Users size={23} />
            </span>
            <span>
              <strong>{l.name}</strong>
              <small>
                {l.members.length}人・{l.items.length}候補　
                {l.owner === actor ? '作成者' : '参加中'}
              </small>
            </span>
          </button>
        ))}
        {ready && !lists.length && (
          <p className="body-copy">
            共有するリストはまだありません。個人の保存はそのまま使えます。
          </p>
        )}
        <PrimaryButton
          icon={Plus}
          disabled={pending || !ready}
          onClick={() => navigate('/saved/lists/new')}
        >
          新しいリストを作る
        </PrimaryButton>
        <PrimaryButton icon={Link2} variant="secondary" onClick={() => setJoining(true)}>
          デモ招待リンクから参加
        </PrimaryButton>
        <p className="small muted">
          まずは2人の操作役で確認できます。実際の友人を招待する機能は準備中です。
        </p>
      </div>
      {joining && (
        <BottomSheet title="デモの招待を受け取る" onClose={() => setJoining(false)}>
          <DemoNotice switcher={false} />
          <label className="field-label">
            デモ招待リンク
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setInvalid(false)
              }}
              placeholder="driveplus-demo://invite/…"
              autoCapitalize="none"
            />
          </label>
          {invalid && <p role="alert">この端末で発行したデモ招待リンクを入力してください。</p>}
          <PrimaryButton
            onClick={() => {
              const token = code
                .trim()
                .match(/^driveplus-demo:\/\/invite\/([a-zA-Z0-9_-]{1,100})$/)?.[1]
              if (!token) {
                setInvalid(true)
                return
              }
              setJoining(false)
              navigate(`/saved/invites/${token}`)
            }}
          >
            招待を確認
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
export function CreateSharedList() {
  const [name, setName] = useState('')
  const [color, setColor] = useState<Color>('teal')
  const { run, pending, ready } = useSharing()
  const navigate = useNavigate()
  return (
    <div className="screen">
      <Header back title="新しいリスト" />
      <div className="page-pad">
        <p className="eyebrow teal">OUR NEXT DAY OFF</p>
        <h1>
          楽しみを持ち寄る
          <br />
          場所をつくろう。
        </h1>
        <DemoNotice switcher={false} />
        <label className="field-label">
          リストの名前
          <input
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ふたりの休日、友だちと行きたい場所…"
          />
        </label>
        <p className="field-label">リストの色</p>
        <ColorPicker value={color} onChange={setColor} />
        <p className="body-copy">
          最初は一人でも大丈夫。候補を選んで追加し、あとから招待できます。
        </p>
        <p className="small muted">
          個人の保存や学習情報は自動で入りません。デモはこの端末に保存します。
        </p>
        <SharingStatus />
        <PrimaryButton
          disabled={!name.trim() || pending || !ready}
          onClick={async () => {
            const result = await run({ type: 'create', name, color })
            if (result) navigate(listPath(result.listId), { replace: true })
          }}
        >
          リストを作成
        </PrimaryButton>
      </div>
    </div>
  )
}
function ReactionControls({ list, item }: { list: SharedList; item: SharedItem }) {
  const { actor, pending, run } = useSharing()
  return (
    <div className="sharing-reactions">
      <div className="sharing-member-reactions">
        {list.members.map((id) => (
          <p key={id}>
            <span className={`sharing-avatar ${id === actor ? 'current' : ''}`}>
              {id === 'self' ? '自' : 'は'}
            </span>
            <span>{actors[id]}</span>
            <strong>{item.reactions[id] ? reactions[item.reactions[id]] : '未回答'}</strong>
          </p>
        ))}
      </div>
      <p className="small muted">あなたの反応（{actors[actor]}として操作中）</p>
      <div className="sharing-reaction-options">
        {(Object.keys(reactions) as (keyof typeof reactions)[]).map((r) => (
          <Chip
            key={r}
            selected={item.reactions[actor] === r}
            disabled={pending}
            onClick={() =>
              void run({
                type: 'react',
                listId: list.id,
                itemId: item.id,
                reaction: item.reactions[actor] === r ? null : r,
              })
            }
          >
            {reactions[r]}
          </Chip>
        ))}
      </div>
      <p className="sharing-hint">選択中の反応をもう一度押すと、未回答に戻ります。</p>
    </div>
  )
}
export function SharedListDetail() {
  const { listId } = useParams()
  const { state, actor, pending, refresh } = useSharing()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const list = state.lists.find((l) => l.id === listId && canRead(l, actor))
  if (!list) return <MissingList />
  const requestedFilter = params.get('filter') ?? 'all'
  const filter = requestedFilter === 'mutual' && list.members.length < 2 ? 'all' : requestedFilter
  const items = list.items.filter(
    (i) =>
      filter === 'all' || (filter === 'unanswered' ? !i.reactions[actor] : allInterested(list, i)),
  )
  const interestedLabel = list.members.length === 2 ? '二人とも興味あり' : 'みんなが興味あり'
  return (
    <div className="screen">
      <Header
        back
        title="共有リスト"
        right={
          <IconButton
            icon={Settings}
            label="リストの設定とメンバー"
            onClick={() => navigate(`${listPath(list.id)}/settings`)}
          />
        }
      />
      <div className="page-pad">
        <DemoNotice />
        <button
          className={`sharing-selector sharing-color-${list.color}`}
          onClick={() => navigate('/saved/lists')}
        >
          <Users size={24} />
          <span>
            <strong>{list.name}</strong>
            <small>{list.members.length}人で持ち寄る行きたい</small>
          </span>
          <ChevronDown size={18} />
        </button>
        <div className="sharing-toolbar">
          <button className="text-button" onClick={() => navigate(`${listPath(list.id)}/settings`)}>
            <Users size={16} />
            メンバー・招待
          </button>
          <button className="text-button" disabled={pending} onClick={() => void refresh()}>
            <RefreshCw size={14} />
            更新する
          </button>
        </div>
        <p className="small muted">デモの最終更新 {formatDate(list.updatedAt)}</p>
        <SharingStatus />
        <div className="chips-row sharing-filters">
          <Chip selected={filter === 'all'} onClick={() => setParams({}, { replace: true })}>
            すべて
          </Chip>
          {list.members.length >= 2 && (
            <Chip
              selected={filter === 'mutual'}
              onClick={() => setParams({ filter: 'mutual' }, { replace: true })}
            >
              {interestedLabel}
            </Chip>
          )}
          <Chip
            selected={filter === 'unanswered'}
            onClick={() => setParams({ filter: 'unanswered' }, { replace: true })}
          >
            自分が未回答
          </Chip>
        </div>
        {items.map((item) => (
          <article className="sharing-card" key={item.id}>
            <button
              data-focus-key={`shared-item:${item.id}`}
              className="sharing-open-candidate"
              onClick={() => navigate(`${listPath(list.id)}/items/${item.id}`)}
              aria-label={`${item.candidate.title}の共有詳細`}
            >
              <CandidatePreview candidate={item.candidate} />
            </button>
            <div className="sharing-card-content">
              <p className="small muted">
                {item.author ? actors[item.author] : '退出したメンバー'}が追加
              </p>
              {item.note && <p className="sharing-note">{item.note}</p>}
              {allInterested(list, item) && <Tag>{interestedLabel}</Tag>}
              <ReactionControls list={list} item={item} />
            </div>
          </article>
        ))}
        {!items.length && (
          <EmptyState
            icon={Heart}
            title={
              list.items.length
                ? 'この条件の候補はまだありません'
                : '最初の「行きたい」を持ち寄ろう'
            }
            description={
              list.items.length
                ? '反応はいつでも変えられます。すべての候補も見てみましょう。'
                : '自分の保存から選ぶか、気になる場所のリンクを追加できます。'
            }
          />
        )}
        <PrimaryButton icon={Plus} onClick={() => setAdding(true)} disabled={pending}>
          候補を追加
        </PrimaryButton>
        <p className="small muted">
          反応は一緒に行きたい気持ちの目安です。運転の引き受けや技能の評価ではありません。
        </p>
      </div>
      {adding && <AddSharedCandidate listId={list.id} onClose={() => setAdding(false)} />}
    </div>
  )
}
function AddSharedCandidate({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { actor } = useSharing()
  const { state } = useApp()
  const { outings } = useContent()
  const now = useContentTime()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const selectable =
    actor === 'self'
      ? [
          ...outings
            .filter(
              (o) =>
                state.savedEvents.includes(o.id) && evaluateOuting(o, now).state !== 'withdrawn',
            )
            .map((o) => fromOuting(o, now)),
          ...state.savedWebSpots.map(fromWebSpot),
          ...state.links.map((l) => fromLink(l)),
        ]
      : []
  if (candidate)
    return <ShareCandidateSheet candidate={candidate} listId={listId} onClose={onClose} />
  return (
    <BottomSheet title="候補を持ち寄る" onClose={onClose}>
      <p className="body-copy">選んだ1件だけを、次の画面で確認して追加します。</p>
      {actor === 'self' ? (
        <>
          <h3>自分の保存から選ぶ</h3>
          {!selectable.length && (
            <p className="small muted">「見つける」で行きたいを保存すると、ここから選べます。</p>
          )}
          {selectable.map((c, index) => (
            <button key={index} className="sharing-pick" onClick={() => setCandidate(c)}>
              <Heart size={17} />
              <span>
                <strong>{c.title}</strong>
                <small>{c.status}</small>
              </span>
              <Plus size={16} />
            </button>
          ))}
        </>
      ) : (
        <p className="notice">
          はるさんはデモの相手役です。この端末の個人保存は表示しません。リンクを入力して持ち寄りを試せます。
        </p>
      )}
      <h3>リンクと名前を入力</h3>
      <label className="field-label">
        場所の名前
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          placeholder="行ってみたいカフェ"
        />
      </label>
      <label className="field-label">
        公開ページのURL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoCapitalize="none"
          placeholder="https://…"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <PrimaryButton
        disabled={!title.trim() || !url.trim()}
        onClick={() => {
          try {
            setCandidate(fromLink({ title, url }))
          } catch (e) {
            setError(e instanceof Error ? e.message : 'URLを確認してください。')
          }
        }}
      >
        共有前に確認する
      </PrimaryButton>
    </BottomSheet>
  )
}
export function SharedCandidateDetail() {
  const { listId, itemId } = useParams()
  const sharing = useSharing()
  const { state, actor, run, pending } = sharing
  const app = useApp()
  const { outings } = useContent()
  const navigate = useNavigate()
  const [external, setExternal] = useState(false)
  const [edit, setEdit] = useState(false)
  const [editVersion, setEditVersion] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [remove, setRemove] = useState(false)
  const list = state.lists.find((l) => l.id === listId && canRead(l, actor))
  const item = list?.items.find((i) => i.id === itemId)
  if (!list || !item) return <MissingList />
  const c = item.candidate
  const canEdit = item.author === actor || (item.author === null && list.owner === actor)
  const canRemove = item.author === actor || list.owner === actor
  const knownOuting = c.kind === 'catalog' && outings.some((o) => o.id === c.catalogId)
  const saved = knownOuting
    ? app.state.savedEvents.includes(c.catalogId!)
    : !!c.url && app.state.links.some((l) => savedUrlKey(l.url) === savedUrlKey(c.url!))
  return (
    <div className="screen">
      <Header back title="持ち寄った候補" />
      <div className="page-pad">
        <DemoNotice switcher={false} />
        <p className="eyebrow teal">{list.name}</p>
        <CandidatePreview candidate={c} />
        <p className="small muted">
          {item.author ? actors[item.author] : '退出したメンバー'}が追加
        </p>
        <p className="body-copy">{item.note || '共有メモはまだありません。'}</p>
        <p className="notice">
          {c.sample
            ? '画面確認用のサンプルです。'
            : 'リンク先の内容・営業状況・料金・駐車場は未確認です。'}
          候補の反応だけで、運転できるかどうかは判断しません。
        </p>
        <p className="small muted">
          {c.kind === 'web' ? '検索日時' : '候補を取り出した日時'}：{formatDate(c.capturedAt)}
          。情報の確認日ではありません。
        </p>
        <SharingStatus />
        <ReactionControls list={list} item={item} />
        {c.url && !c.sample && (
          <PrimaryButton variant="secondary" icon={Link2} onClick={() => setExternal(true)}>
            出典のページを確認
          </PrimaryButton>
        )}
        {c.url && c.sample && <p className="small muted">サンプルの出典リンクは開きません。</p>}
        {actor === 'self' && (knownOuting || (c.url && !c.sample)) && (
          <PrimaryButton
            icon={Heart}
            variant="secondary"
            disabled={saved || app.storageProtected}
            onClick={() => {
              if (knownOuting) app.toggleEvent(c.catalogId!)
              else if (c.url) {
                const normalized = normalizeSavedUrl(c.url)
                app.update((s) => ({
                  ...s,
                  links: s.links.some((l) => savedUrlKey(l.url) === normalized.key)
                    ? s.links
                    : [
                        ...s.links,
                        {
                          id: crypto.randomUUID(),
                          url: normalized.url,
                          title: c.title,
                          source: normalized.source,
                          addedAt: new Date().toISOString(),
                        },
                      ],
                }))
              }
            }}
          >
            {saved ? '私の行きたいに保存済み' : '私の行きたいにも保存'}
          </PrimaryButton>
        )}
        {canEdit && (
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              setNote(item.note)
              setEditVersion(sharing.version)
              setEdit(true)
            }}
          >
            共有メモを編集
          </PrimaryButton>
        )}
        {canRemove && (
          <PrimaryButton variant="ghost" icon={Trash2} onClick={() => setRemove(true)}>
            このリストから削除
          </PrimaryButton>
        )}
      </div>
      {external && c.url && (
        <ExternalModal
          title={c.title}
          kind="sns"
          request={{ type: 'personal', url: c.url }}
          onClose={() => setExternal(false)}
        />
      )}
      {edit && (
        <BottomSheet title="共有メモを編集" onClose={() => setEdit(false)}>
          <label className="field-label">
            みんなに見せるメモ
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          <SharingStatus />
          <PrimaryButton
            disabled={pending}
            onClick={async () => {
              if (await run({ type: 'edit', listId: list.id, itemId: item.id, note }, editVersion))
                setEdit(false)
            }}
          >
            共有メモを保存
          </PrimaryButton>
        </BottomSheet>
      )}
      {remove && (
        <Modal title="この候補を削除しますか？" onClose={() => setRemove(false)}>
          <p className="body-copy">
            このリストの全員から見えなくなります。それぞれの個人保存には影響しません。
          </p>
          <SharingStatus />
          <PrimaryButton
            variant="danger"
            disabled={pending}
            onClick={async () => {
              if (await run({ type: 'removeItem', listId: list.id, itemId: item.id })) {
                setRemove(false)
                navigate(listPath(list.id), { replace: true })
              }
            }}
          >
            候補を削除
          </PrimaryButton>
        </Modal>
      )}
    </div>
  )
}
export function SharedListSettings() {
  const { listId } = useParams()
  const { state, actor, run, pending } = useSharing()
  const navigate = useNavigate()
  const list = state.lists.find((l) => l.id === listId && canRead(l, actor))
  // Keep typed text on external refresh; the form retains its own edit version.
  return list ? (
    <ListSettingsForm
      key={list.id}
      list={list}
      actor={actor}
      pending={pending}
      run={run}
      navigateToList={() => navigate(listPath(list.id))}
    />
  ) : (
    <MissingList />
  )
}
function ListSettingsForm({
  list,
  actor,
  pending,
  run,
  navigateToList,
}: {
  list: SharedList
  actor: Actor
  pending: boolean
  run: ReturnType<typeof useSharing>['run']
  navigateToList: () => void
}) {
  const { version } = useSharing()
  const [editVersion, setEditVersion] = useState(version)
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState(list.name)
  const [color, setColor] = useState(list.color)
  useEffect(() => {
    if (!dirty) {
      setName(list.name)
      setColor(list.color)
      setEditVersion(version)
    }
  }, [dirty, list.name, list.color, version])
  const [confirm, setConfirm] = useState<{
    title: string
    text: string
    command: Command
    leave?: boolean
  } | null>(null)
  const navigate = useNavigate()
  const owner = list.owner === actor
  return (
    <div className="screen">
      <Header back title="メンバーと設定" />
      <div className="page-pad">
        <DemoNotice />
        <h1>{list.name}</h1>
        <SharingStatus />
        <h2 className="saved-subheading">参加している人</h2>
        {list.members.map((member) => (
          <div className="sharing-member" key={member}>
            <span className="sharing-avatar">{member === 'self' ? '自' : 'は'}</span>
            <div>
              <strong>{actors[member]}</strong>
              <small>{member === list.owner ? '作成者' : 'メンバー'}</small>
            </div>
            {owner && member !== actor && (
              <IconButton
                icon={Trash2}
                label={`${actors[member]}を外す`}
                onClick={() =>
                  setConfirm({
                    title: 'このメンバーを外しますか？',
                    text: '追加した候補は残り、追加者は「退出したメンバー」になります。この人の反応を削除し、リストへの操作を止めます。',
                    command: { type: 'removeMember', listId: list.id, member },
                  })
                }
              />
            )}
          </div>
        ))}
        {owner && (
          <>
            <PrimaryButton
              icon={UserPlus}
              disabled={pending}
              onClick={async () => {
                const result = await run({ type: 'invite', listId: list.id })
                if (result?.token) navigate(`/saved/invites/${result.token}`)
              }}
            >
              デモの招待を作る
            </PrimaryButton>
            <p className="small muted">1人分・7日間の招待です。参加には作成者の承認が必要です。</p>
            {list.invites.map((i) => (
              <article className="sharing-invite-row" key={i.token}>
                <strong>
                  {i.status === 'used'
                    ? '承認済み'
                    : i.status === 'revoked'
                      ? '取り消し済み'
                      : i.applicant
                        ? `${actors[i.applicant]}から参加申請`
                        : '参加申請待ち'}
                </strong>
                <p className="small muted">有効期限 {formatDate(i.expiresAt)}</p>
                <button
                  className="text-button"
                  onClick={() => navigate(`/saved/invites/${i.token}`)}
                >
                  招待・申請を確認
                </button>
              </article>
            ))}
            <h2 className="saved-subheading">リストを編集</h2>
            <label className="field-label">
              リスト名
              <input
                maxLength={40}
                value={name}
                onChange={(e) => {
                  setDirty(true)
                  setName(e.target.value)
                }}
              />
            </label>
            <ColorPicker
              value={color}
              onChange={(next) => {
                setDirty(true)
                setColor(next)
              }}
            />
            <PrimaryButton
              disabled={pending || !name.trim()}
              variant="secondary"
              onClick={async () => {
                if (await run({ type: 'rename', listId: list.id, name, color }, editVersion))
                  navigateToList()
              }}
            >
              変更を保存
            </PrimaryButton>
            {list.members.length > 1 && (
              <>
                <h2 className="saved-subheading">作成者を引き継ぐ</h2>
                <p className="small muted">
                  相手が承諾してから退出できます。引き継ぎ時に、発行済みの招待は失効します。
                </p>
                {list.successor ? (
                  <>
                    <p>{actors[list.successor]}の承諾待ちです。</p>
                    <PrimaryButton
                      variant="secondary"
                      disabled={pending}
                      onClick={() => void run({ type: 'cancelTransfer', listId: list.id })}
                    >
                      引き継ぎ依頼を取り消す
                    </PrimaryButton>
                  </>
                ) : (
                  list.members
                    .filter((m) => m !== actor)
                    .map((m) => (
                      <PrimaryButton
                        key={m}
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          void run({ type: 'offerTransfer', listId: list.id, member: m })
                        }
                      >
                        {actors[m]}に引き継ぎを依頼
                      </PrimaryButton>
                    ))
                )}
              </>
            )}
            <PrimaryButton
              variant="danger"
              onClick={() =>
                setConfirm({
                  title: 'リストを全員から削除しますか？',
                  text: '候補・反応・メンバー・招待を、このデモの保存領域から削除します。元に戻せません。個人の保存は残ります。',
                  command: { type: 'delete', listId: list.id },
                  leave: true,
                })
              }
            >
              共有リストを削除
            </PrimaryButton>
          </>
        )}
        {list.successor === actor && (
          <>
            <p className="notice">
              作成者の引き継ぎ依頼が届いています。承諾すると招待・参加承認・メンバー管理を担当します。
            </p>
            <PrimaryButton
              disabled={pending}
              onClick={() => void run({ type: 'acceptTransfer', listId: list.id })}
            >
              作成者の引き継ぎを承諾
            </PrimaryButton>
          </>
        )}
        {!owner && (
          <PrimaryButton
            variant="danger"
            onClick={() =>
              setConfirm({
                title: 'このリストから退出しますか？',
                text: '追加した候補は残ります。自分の反応は削除され、共有リストを見たり変更したりできなくなります。個人保存は残ります。',
                command: { type: 'leave', listId: list.id },
                leave: true,
              })
            }
          >
            リストから退出
          </PrimaryButton>
        )}
        <p className="small muted">
          デモ内の権限を確認しています。実際のアカウント認証・別端末での共有は準備中です。
        </p>
      </div>
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="body-copy">{confirm.text}</p>
          <SharingStatus />
          <PrimaryButton
            variant="danger"
            disabled={pending}
            onClick={async () => {
              if (await run(confirm.command)) {
                setConfirm(null)
                if (confirm.leave) navigate('/saved/lists', { replace: true })
              }
            }}
          >
            確認して実行
          </PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => setConfirm(null)}>
            キャンセル
          </PrimaryButton>
        </Modal>
      )}
    </div>
  )
}
export function SharedInvitation() {
  const { token } = useParams()
  const { state, actor, setActor, run, pending } = useSharing()
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const list = state.lists.find((l) => l.invites.some((i) => i.token === token))
  const invitation = list?.invites.find((i) => i.token === token)
  const valid = !!invitation && invitation.status === 'open' && invitation.expiresAt > now
  const owner = list?.owner === actor
  const member = !!list && canRead(list, actor)
  const request = (type: 'request' | 'withdraw' | 'approve' | 'reject' | 'revoke') => {
    if (list && token) void run({ type, listId: list.id, token })
  }
  return (
    <div className="screen">
      <Header back title="リストへの招待" />
      <div className="page-pad">
        <DemoNotice switcher={false} />
        <SharingStatus />
        <div className="sharing-invite-hero">
          <span className="round-icon">
            <UserPlus size={30} />
          </span>
          <h1>
            「行きたい」を、
            <br />
            一緒に持ち寄ろう。
          </h1>
        </div>
        {(valid || member) && list && (
          <>
            <p className="sharing-invited-name">{list.name}</p>
            <p className="small muted">
              作成者：{actors[list.owner]}　操作中：{actors[actor]}
            </p>
          </>
        )}
        {!valid && (
          <p className="notice">
            {invitation?.status === 'used'
              ? 'この招待は承認済みです。'
              : '招待は期限切れ、取り消し済み、またはこの端末にありません。新しい招待をお願いしてください。'}
          </p>
        )}
        {valid && invitation && list && (
          <>
            <p className="small muted">有効期限 {formatDate(invitation.expiresAt)}・1人分</p>
            {owner ? (
              <>
                <label className="field-label">
                  デモ招待リンク（この端末だけ）
                  <textarea
                    readOnly
                    value={`driveplus-demo://invite/${invitation.token}`}
                    aria-label="デモ招待リンク"
                  />
                </label>
                <p className="small muted">
                  LINEなどで送っても、別のスマホでは参加できません。下のボタンで相手役を試せます。
                </p>
                <PrimaryButton
                  disabled={pending}
                  onClick={() => setActor(actor === 'self' ? 'haru' : 'self')}
                >
                  招待される側を試す
                </PrimaryButton>
                {invitation.applicant && (
                  <article className="sharing-invite-row">
                    <h3>{actors[invitation.applicant]}からの参加申請</h3>
                    <p className="body-copy">
                      表示名だけでは本人確認になりません。実共有では、普段の連絡先で招待相手か確認します。
                    </p>
                    <PrimaryButton disabled={pending} onClick={() => request('approve')}>
                      参加を承認
                    </PrimaryButton>
                    <PrimaryButton
                      variant="secondary"
                      disabled={pending}
                      onClick={() => request('reject')}
                    >
                      申請を断る
                    </PrimaryButton>
                  </article>
                )}
                <PrimaryButton variant="ghost" disabled={pending} onClick={() => request('revoke')}>
                  この招待を取り消す
                </PrimaryButton>
              </>
            ) : member ? (
              <p>このリストには参加済みです。</p>
            ) : invitation.applicant === actor ? (
              <>
                <p className="notice">
                  参加申請を受け付けました（この端末のデモ）。作成者の承認待ちです。候補はまだ見られません。
                </p>
                <PrimaryButton
                  variant="secondary"
                  disabled={pending}
                  onClick={() => request('withdraw')}
                >
                  参加申請を取り消す
                </PrimaryButton>
                <PrimaryButton onClick={() => setActor(list.owner)} disabled={pending}>
                  作成者として承認を試す
                </PrimaryButton>
              </>
            ) : (
              <>
                <p className="body-copy">
                  参加すると、このリストの候補・共有メモ・反応が見られます。個人の保存全件や学習情報は共有しません。
                </p>
                <p className="small muted">
                  退出しても、追加した候補はリストに残ります。デモの表示名：{actors[actor]}
                </p>
                <PrimaryButton
                  disabled={pending || !!invitation.applicant}
                  onClick={() => request('request')}
                >
                  説明を確認して参加申請
                </PrimaryButton>
              </>
            )}
          </>
        )}
        {member && list && (
          <PrimaryButton variant="secondary" onClick={() => navigate(listPath(list.id))}>
            リストを開く
          </PrimaryButton>
        )}
        <PrimaryButton variant="ghost" onClick={() => navigate('/saved/lists')}>
          リスト一覧へ
        </PrimaryButton>
      </div>
    </div>
  )
}
