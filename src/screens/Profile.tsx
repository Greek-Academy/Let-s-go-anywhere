import { StorageDetails } from '../components/StorageStatus'
import { useContent } from '../content/ContentProvider'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  Heart,
  Leaf,
  MapPin,
  MessageCircle,
  Pencil,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import { companions, interests } from '../data/options'
import { useApp } from '../state/AppState'
import {
  Chip,
  EmptyState,
  Header,
  MenuRow,
  Modal,
  PrimaryButton,
  SectionHeading,
  Tag,
} from '../components/ui'
import { LessonCard } from '../components/Cards'

export function Profile() {
  const { state } = useApp()
  const navigate = useNavigate()
  return (
    <div className="screen profile-screen">
      <Header
        back
        title="マイページ"
        right={
          <button
            className="icon-button"
            aria-label="設定を開く"
            onClick={() => navigate('/settings')}
          >
            <Settings size={21} />
          </button>
        }
      />
      <div className="page-pad">
        <div className="profile-hero">
          <div className="profile-avatar">
            <UserRound size={39} strokeWidth={1.2} />
          </div>
          <div>
            <p className="eyebrow teal">HELLO, WEEKEND EXPLORER</p>
            <h1>{state.profile.name || 'ゲスト'}さん</h1>
            <p>
              <MapPin size={12} />
              {state.profile.area || 'エリア未設定'}
            </p>
          </div>
        </div>
        <div className="profile-stats">
          <button onClick={() => navigate('/saved')}>
            <Heart size={20} />
            <strong>{state.savedEvents.length + state.links.length}</strong>
            <small>行きたい</small>
          </button>
          <button onClick={() => navigate('/profile/learning')}>
            <BookOpen size={20} />
            <strong>{state.learned.length}</strong>
            <small>学習した内容</small>
          </button>
          <button onClick={() => navigate('/profile/consultations')}>
            <MessageCircle size={20} />
            <strong>{state.consultations.length}</strong>
            <small>講習の相談</small>
          </button>
        </div>
        <div className="profile-interests">
          <div className="section-heading">
            <h2>あなたの「好き」</h2>
            <button className="text-button" onClick={() => navigate('/profile/edit')}>
              <Pencil size={14} />
              編集
            </button>
          </div>
          <div className="tags">
            {state.profile.interests.length ? (
              state.profile.interests.map((t) => <Tag key={t}>{t}</Tag>)
            ) : (
              <p className="muted small">気になるものを登録してみましょう。</p>
            )}
          </div>
        </div>
        <div className="menu-group">
          <MenuRow
            icon={UserRound}
            title="プロフィール・出発エリア"
            onClick={() => navigate('/profile/edit')}
          />
          <MenuRow
            icon={Heart}
            title="行きたいリスト"
            value={`${state.savedEvents.length + state.links.length}件`}
            onClick={() => navigate('/saved')}
          />
          <MenuRow icon={BookOpen} title="学習履歴" onClick={() => navigate('/profile/learning')} />
          <MenuRow
            icon={MessageCircle}
            title="講習相談・共有履歴"
            onClick={() => navigate('/profile/consultations')}
          />
          <MenuRow
            icon={ClipboardList}
            title="お出かけ・講習の振り返り"
            onClick={() => navigate('/reflection')}
          />
          <MenuRow icon={Settings} title="設定" onClick={() => navigate('/settings')} />
        </div>
        <div className="profile-footer">
          <Leaf size={22} strokeWidth={1.3} />
          <p>
            少しずつ、自分のペースで。
            <br />
            次の休日が、楽しみになりますように。
          </p>
          <span>Drive+ · 画面確認用モック</span>
        </div>
      </div>
    </div>
  )
}
export function ProfileEdit() {
  const { state, update, toast } = useApp()
  const [draft, setDraft] = useState(state.profile)
  const navigate = useNavigate()
  return (
    <div className="screen">
      <Header back title="プロフィールの編集" />
      <div className="page-pad">
        <h1>あなたらしい休日に。</h1>
        <p className="body-copy">いつでも、今の気分に合わせて変更できます。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            update((s) => ({
              ...s,
              profile: { ...draft, area: draft.area.trim() || '東京・渋谷駅周辺' },
            }))
            toast('プロフィールを保存しました')
            navigate('/profile')
          }}
        >
          <label className="field-label">
            呼ばれたい名前 <span>任意</span>
            <input
              value={draft.name}
              maxLength={30}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field-label">
            出発エリア
            <input
              value={draft.area}
              onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              placeholder="東京・渋谷駅周辺"
            />
          </label>
          <label className="field-label">
            一緒に出かけたい人
            <select
              value={draft.companion}
              onChange={(e) => setDraft({ ...draft, companion: e.target.value })}
            >
              <option value="">未設定</option>
              {companions.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            興味・趣味 <span>複数選択可</span>
          </label>
          <div className="chips wrap edit-interests">
            {interests.map((i) => (
              <Chip
                key={i.name}
                selected={draft.interests.includes(i.name)}
                onClick={() =>
                  setDraft({
                    ...draft,
                    interests: draft.interests.includes(i.name)
                      ? draft.interests.filter((v) => v !== i.name)
                      : [...draft.interests, i.name],
                  })
                }
              >
                {i.name}
              </Chip>
            ))}
          </div>
          <PrimaryButton type="submit" icon={Check}>
            変更を保存
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
export function LearningHistory() {
  const { learningContents } = useContent()
  const { state } = useApp()
  const navigate = useNavigate()
  const learned = learningContents.filter((l) => state.learned.includes(l.id))
  return (
    <div className="screen">
      <Header back title="学習履歴" />
      <div className="page-pad">
        <p className="eyebrow teal">YOUR SMALL STEPS</p>
        <h1>
          積み重ねた、
          <br />
          小さな準備。
        </h1>
        <p className="body-copy">学んだことは、何度でも振り返れます。</p>
        <div className="lesson-list">
          {learned.map((l) => (
            <div key={l.id}>
              <p className="history-date">
                {new Date(state.learningDates[l.id]).toLocaleDateString('ja-JP')} に学習
              </p>
              <LessonCard lesson={l} />
            </div>
          ))}
        </div>
        {!learned.length && (
          <EmptyState
            icon={BookOpen}
            title="ここに学習の記録が残ります"
            description="学習の最後に「学習を記録」を押すと、ここから復習できます。"
            action="学ぶを開く"
            onAction={() => navigate('/learn')}
          />
        )}
      </div>
    </div>
  )
}
export function ConsultationHistory() {
  const { drivingSchools } = useContent()
  const { state } = useApp()
  const navigate = useNavigate()
  return (
    <div className="screen">
      <Header back title="講習相談・共有履歴" />
      <div className="page-pad">
        <p className="eyebrow teal">YOUR CONVERSATIONS</p>
        <h1>
          相談したことを、
          <br />
          いつでも確認。
        </h1>
        <p className="body-copy">共有先・内容・同意日時を確認できます。</p>
        <div className="consultation-history">
          {state.consultations.map((c) => (
            <button key={c.id} onClick={() => navigate(`/consultations/${c.id}`)}>
              <div>
                <Tag tone={c.status.includes('キャンセル') ? 'neutral' : 'mint'}>{c.status}</Tag>
                <h3>{drivingSchools.find((s) => s.id === c.schoolId)?.name}</h3>
                <p>{new Date(c.createdAt).toLocaleString('ja-JP')}</p>
                <small>{c.shared.length}項目を共有 · 外部送信なし</small>
              </div>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
        {!state.consultations.length && (
          <EmptyState
            icon={MessageCircle}
            title="相談は、まだありません"
            description="講習会社を選んで、聞いてみたいことをメモにしてみましょう。"
            action="講習を探す"
            onAction={() => navigate('/schools')}
          />
        )}
      </div>
    </div>
  )
}
export function AppSettings() {
  const { state, update, reset, toast } = useApp()
  const navigate = useNavigate()
  const [resetOpen, setResetOpen] = useState(false)
  return (
    <div className="screen">
      <Header back title="設定" />
      <div className="page-pad">
        <h1>
          使いやすく、
          <br />
          あなたに合わせて。
        </h1>
        <SectionHeading title="表示" />
        <label className="setting-toggle">
          <span>
            <strong>文字を少し大きくする</strong>
            <small>本文を読みやすいサイズにします</small>
          </span>
          <input
            role="switch"
            type="checkbox"
            checked={state.settings.largeText}
            onChange={(e) =>
              update((s) => ({ ...s, settings: { ...s.settings, largeText: e.target.checked } }))
            }
          />
          <span className="switch-track" />
        </label>
        <label className="setting-toggle">
          <span>
            <strong>画面の動きを抑える</strong>
            <small>アニメーションを控えめにします</small>
          </span>
          <input
            role="switch"
            type="checkbox"
            checked={state.settings.reducedMotion}
            onChange={(e) =>
              update((s) => ({
                ...s,
                settings: { ...s.settings, reducedMotion: e.target.checked },
              }))
            }
          />
          <span className="switch-track" />
        </label>
        <SectionHeading title="プロフィールと保存" />
        <div className="menu-group">
          <MenuRow
            icon={UserRound}
            title="プロフィールを変更"
            onClick={() => navigate('/profile/edit')}
          />
          <MenuRow
            icon={MessageCircle}
            title="共有した内容・同意履歴"
            onClick={() => navigate('/profile/consultations')}
          />
        </div>
        <PrimaryButton
          variant="secondary"
          onClick={() => {
            update((s) => ({ ...s, hiddenEvents: [] }))
            toast('非表示にしたお出かけを戻しました')
          }}
        >
          おすすめの非表示をリセット
        </PrimaryButton>
        <StorageDetails />
        <SectionHeading title="このモックについて" />
        <div className="settings-about">
          <p>Drive+（仮） / PRD v0.2</p>
          <p>
            データはこの端末のアプリまたはブラウザ内に保存され、相互に同期しません。ログイン、外部API、予約、決済、通知の配信はありません。
          </p>
        </div>
        <PrimaryButton variant="danger" icon={Trash2} onClick={() => setResetOpen(true)}>
          モックの保存データを削除
        </PrimaryButton>
      </div>
      {resetOpen && (
        <Modal title="保存データを削除しますか？" onClose={() => setResetOpen(false)}>
          <p className="body-copy">
            初回設定、行きたい、車候補、学習、相談、振り返りのデータをこの保存領域から削除し、最初の画面に戻ります。読み込めなかった元のデータと、保存されていない変更も失われます。この操作は取り消せません。
          </p>
          <PrimaryButton
            variant="danger"
            onClick={async () => {
              if (!(await reset())) return
              setResetOpen(false)
              navigate('/welcome', { replace: true })
            }}
          >
            削除して最初から始める
          </PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => setResetOpen(false)}>
            キャンセル
          </PrimaryButton>
        </Modal>
      )}
    </div>
  )
}
export function Reflection() {
  const { state, update, toast } = useApp()
  const [type, setType] = useState('お出かけ')
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [advice, setAdvice] = useState('')
  const navigate = useNavigate()
  const outcomes =
    type === 'お出かけ'
      ? ['行けた', '別の交通手段を選んだ', '今回は見送った', 'これから考えたい']
      : ['教わったことを振り返りたい', '残った不安を相談したい', 'これから受講する']
  return (
    <div className="screen">
      <Header back title="休日と学びの振り返り" />
      <div className="page-pad">
        <div className="feature-icon">
          <Leaf size={30} />
        </div>
        <h1>どんな一日でしたか？</h1>
        <p className="body-copy">
          行けた日も、見送った日も。
          <br />
          あなたの選択を、あなたの言葉で。
        </p>
        <div className="segmented">
          {['お出かけ', '講習'].map((t) => (
            <Chip
              key={t}
              selected={type === t}
              onClick={() => {
                setType(t)
                setOutcome('')
              }}
            >
              {t}の振り返り
            </Chip>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            update((s) => ({
              ...s,
              reflections: [
                {
                  id: crypto.randomUUID(),
                  type,
                  outcome: outcome || '自由メモ',
                  note,
                  advice: type === '講習' ? advice : '',
                  createdAt: new Date().toISOString(),
                },
                ...s.reflections,
              ],
            }))
            setNote('')
            setAdvice('')
            setOutcome('')
            toast('振り返りを保存しました')
          }}
        >
          <div className="chips wrap reflection-chips">
            {outcomes.map((o) => (
              <Chip key={o} selected={outcome === o} onClick={() => setOutcome(o)}>
                {o}
              </Chip>
            ))}
          </div>
          <label className="field-label">
            思ったこと・学んだこと
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="小さなことから、自由にどうぞ。"
            />
          </label>
          {type === '講習' && (
            <label className="field-label">
              講師からの助言 <span>自分の記録と分けて残せます</span>
              <textarea
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                placeholder="講師に教わったこと"
              />
            </label>
          )}
          <PrimaryButton
            type="submit"
            icon={Check}
            disabled={!outcome && !note.trim() && !advice.trim()}
          >
            振り返りを保存
          </PrimaryButton>
        </form>
        {state.reflections.length > 0 && (
          <>
            <SectionHeading title="これまでの振り返り" />
            {state.reflections.map((r) => (
              <article key={r.id} className="reflection-card">
                <div>
                  <Tag>{r.type}</Tag>
                  <small>{new Date(r.createdAt).toLocaleDateString('ja-JP')}</small>
                </div>
                <h3>{r.outcome}</h3>
                <p>{r.note}</p>
                {r.advice && (
                  <div className="reflection-advice">
                    <strong>講師からの助言（本人の記録）</strong>
                    <p>{r.advice}</p>
                  </div>
                )}
              </article>
            ))}
          </>
        )}
        <button className="check-banner" onClick={() => navigate('/learn')}>
          <Sparkles size={24} />
          <span>
            <strong>気になったことを、復習しよう。</strong>
            <small>学ぶを開く</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  )
}
