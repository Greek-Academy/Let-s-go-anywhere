import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Send,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { drivingSchools, sharingLabels } from '../data/mockData'
import type { SharedField } from '../data/types'
import type { AppState } from '../state/AppState'
import { useApp } from '../state/AppState'
import { SchoolCard } from '../components/Cards'
import {
  BottomSheet,
  Choice,
  EmptyState,
  Header,
  InfoRows,
  PrimaryButton,
  SampleNote,
  SectionHeading,
  Tag,
} from '../components/ui'
import { getResults } from './Learning'

export function Schools() {
  const { state, update } = useApp()
  const [filterOpen, setFilterOpen] = useState(false)
  const filters = state.schoolFilters
  const [draft, setDraft] = useState(filters)
  const filtered = drivingSchools.filter(
    (s) =>
      (filters.area === 'すべて' || s.area.includes(filters.area)) &&
      (filters.practice === 'すべて' || s.practices.includes(filters.practice)) &&
      (filters.budget === 'すべて' || s.price <= Number(filters.budget)) &&
      (filters.vehicle === 'すべて' || s.vehicles.includes(filters.vehicle)),
  )
  const activeCount = Object.values(filters).filter((v) => v !== 'すべて').length
  return (
    <div className="screen schools-screen">
      <Header />
      <div className="page-pad">
        <p className="eyebrow teal">SOMEONE ON YOUR SIDE</p>
        <h1>
          一歩目を、
          <br />
          一緒に考える人。
        </h1>
        <p className="body-copy">あなたの目的や不安に合う、講習を探そう。</p>
        <div className="school-support-banner">
          <HeartHandshake size={34} strokeWidth={1.3} />
          <div>
            <strong>まずは、相談からで大丈夫。</strong>
            <p>テストを受けていなくても相談できます。</p>
          </div>
        </div>
        <div className="school-filter-row">
          <button
            onClick={() => {
              setDraft(filters)
              setFilterOpen(true)
            }}
          >
            <MapPin size={14} />
            {filters.area === 'すべて' ? 'エリア' : filters.area}
            <ChevronDown size={13} />
          </button>
          <button
            onClick={() => {
              setDraft(filters)
              setFilterOpen(true)
            }}
          >
            {filters.practice === 'すべて' ? '練習内容' : filters.practice}
            <ChevronDown size={13} />
          </button>
          <button
            onClick={() => {
              setDraft(filters)
              setFilterOpen(true)
            }}
          >
            <SlidersHorizontal size={14} />
            絞り込み{activeCount > 0 && <span>{activeCount}</span>}
          </button>
        </div>
        <SectionHeading
          title="あなたに合う講習を探す"
          subtitle={`${filtered.length}社のサンプルを表示`}
        />
        <div className="school-list">
          {filtered.map((s) => (
            <SchoolCard key={s.id} school={s} />
          ))}
        </div>
        {!filtered.length && (
          <EmptyState
            title="条件に合う講習会社はありません"
            description="エリアや練習内容を変えて探せます。条件外の会社は表示していません。"
            action="条件をリセット"
            onAction={() =>
              update((s) => ({
                ...s,
                schoolFilters: {
                  area: 'すべて',
                  practice: 'すべて',
                  budget: 'すべて',
                  vehicle: 'すべて',
                },
              }))
            }
          />
        )}
        <SampleNote>
          会社・講師・料金はすべて架空のサンプルです。空き枠情報は取得していません。
        </SampleNote>
        <p className="disclosure">
          本サービスでは掲載・紹介に対して報酬を受け取る場合があります。このモックでは掲載契約・紹介料は発生しません。
        </p>
      </div>
      {filterOpen && (
        <BottomSheet title="講習の絞り込み" onClose={() => setFilterOpen(false)}>
          <label className="field-label">
            対応エリア
            <select
              value={draft.area}
              onChange={(e) => setDraft({ ...draft, area: e.target.value })}
            >
              {['すべて', '東京', '神奈川', '埼玉', '千葉'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            練習したい内容
            <select
              value={draft.practice}
              onChange={(e) => setDraft({ ...draft, practice: e.target.value })}
            >
              {['すべて', '駐車', '車線変更', '高速道路', '夜間', '一般道'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            予算の目安
            <select
              value={draft.budget}
              onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
            >
              <option value="すべて">指定なし</option>
              <option value="15000">15,000円まで</option>
              <option value="20000">20,000円まで</option>
            </select>
          </label>
          <label className="field-label">
            使いたい車
            <select
              value={draft.vehicle}
              onChange={(e) => setDraft({ ...draft, vehicle: e.target.value })}
            >
              {['すべて', '教習車', 'マイカー'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <PrimaryButton
            onClick={() => {
              update((s) => ({ ...s, schoolFilters: draft }))
              setFilterOpen(false)
            }}
          >
            この条件で表示
          </PrimaryButton>
          <PrimaryButton
            variant="ghost"
            onClick={() =>
              setDraft({ area: 'すべて', practice: 'すべて', budget: 'すべて', vehicle: 'すべて' })
            }
          >
            条件をリセット
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
export function SchoolDetail() {
  const { id } = useParams()
  const school = drivingSchools.find((s) => s.id === id)
  const navigate = useNavigate()
  if (!school)
    return (
      <>
        <Header back />
        <EmptyState
          title="講習会社が見つかりません"
          description="講習一覧からお選びください。"
          action="講習を探す"
          onAction={() => navigate('/schools')}
        />
      </>
    )
  return (
    <div className="screen">
      <Header back title="講習会社・講師" />
      <div className={`school-detail-cover ${school.color}`}>
        <div className="school-cover-road" />
        <CarFront size={93} strokeWidth={1} />
        <span>YOUR FIRST STEP, TOGETHER.</span>
      </div>
      <div className="page-pad">
        <div className="tags">
          <Tag tone="neutral">サンプルの講習会社</Tag>
          <Tag>出張講習</Tag>
        </div>
        <h1>{school.name}</h1>
        <p className="location-caption">
          <MapPin size={14} />
          {school.area.join('・')}エリア
        </p>
        <p className="body-copy">{school.description}</p>
        <div className="teacher-card">
          <div className={`teacher-avatar ${school.color}`}>{school.initial}</div>
          <div>
            <small>担当講師の紹介</small>
            <strong>{school.teacher}</strong>
            <p>{school.feature}</p>
          </div>
        </div>
        <SectionHeading title="相談できる練習内容" />
        <div className="chips wrap">
          {school.practices.map((p) => (
            <Tag key={p}>{p}</Tag>
          ))}
        </div>
        <p className="muted small">実際の内容・必要時間は、講師と状態を確認して調整します。</p>
        <InfoRows
          rows={[
            ['料金の目安', `¥${school.price.toLocaleString()} / ${school.duration}〜（サンプル）`],
            ['利用する車', school.vehicles.join('・')],
            ['追加料金', '延長・出張条件を相談時に確認'],
            ['キャンセル条件', '申込前に公式の条件を確認'],
            ['日時', '希望日時を相談'],
            ['連絡方法', '相談フォーム（このモックでは端末内のみ）'],
          ]}
        />
        <SectionHeading title="はじめての相談の流れ" />
        <ol className="steps-list">
          <li>
            <span>1</span>
            <div>
              <strong>希望や不安をメモにする</strong>
              <p>うまく言葉にできなくても大丈夫。</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>内容を確認して相談する</strong>
              <p>共有する項目は、自分で選べます。</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>講師と日程・内容を調整する</strong>
              <p>相談だけでは予約は確定しません。</p>
            </div>
          </li>
        </ol>
        <PrimaryButton icon={CalendarDays} onClick={() => navigate(`/consult/${school.id}`)}>
          希望日時を相談
        </PrimaryButton>
        <p className="disclosure">
          掲載・紹介報酬がある場合は申込前に表示する設計です。この会社・講師・料金は架空のサンプルです。
        </p>
      </div>
    </div>
  )
}
function schoolFromId(id: string | undefined) {
  return drivingSchools.find((s) => s.id === id)
}
export function ConsultationMemo() {
  const { id } = useParams()
  const school = schoolFromId(id)
  const navigate = useNavigate()
  const { state, update } = useApp()
  const memo = state.memo
  if (!school)
    return (
      <>
        <Header back />
        <EmptyState
          title="相談先を選んでください"
          description="まずは講習会社を探しましょう。"
          action="講習を探す"
          onAction={() => navigate('/schools')}
        />
      </>
    )
  const setMemo = (patch: Partial<typeof memo>) =>
    update((s) => ({ ...s, memo: { ...s.memo, ...patch } }))
  return (
    <div className="screen">
      <Header back title="講師への相談メモ" />
      <div className="page-pad">
        <div className="consult-progress">
          <span className="active">1 メモを作成</span>
          <ArrowRight size={13} />
          <span>2 共有を確認</span>
        </div>
        <h1>
          あなたの「やりたい」を、
          <br />
          聞かせてください。
        </h1>
        <p className="body-copy">ここで書いた内容は、自動で保存されます。</p>
        <div className="recipient-card">
          <MessageCircle size={21} />
          <span>
            <small>相談先</small>
            <strong>{school.name}</strong>
          </span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            navigate(`/consult/${school.id}/review`)
          }}
        >
          <label className="field-label">
            実現したいこと・目標 <span>任意</span>
            <textarea
              value={memo.goal}
              onChange={(e) => setMemo({ goal: e.target.value })}
              placeholder="旅行でパートナーと運転を交代したい"
            />
          </label>
          <label className="field-label">
            希望日時 <span>任意</span>
            <input
              value={memo.when}
              onChange={(e) => setMemo({ when: e.target.value })}
              placeholder="10月の土日 / 日時も含めて相談したい"
            />
          </label>
          <label className="field-label">
            講習で使いたい車
            <select value={memo.vehicle} onChange={(e) => setMemo({ vehicle: e.target.value })}>
              {[
                '相談して決めたい',
                '教習車',
                'マイカー',
                'レンタカー等（利用可否を確認したい）',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            講師に聞きたいこと <span>任意</span>
            <textarea
              className="large-textarea"
              value={memo.questions}
              onChange={(e) => setMemo({ questions: e.target.value })}
              placeholder="駐車が不安です。基本の確認から教わりたいです。"
            />
          </label>
          <div className="notice">
            <ShieldCheck size={18} />
            <span>次の画面で共有する項目を選べます。同意するまで、相談は送信されません。</span>
          </div>
          <PrimaryButton type="submit" icon={ArrowRight}>
            共有する内容を確認
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
function sharedValues(state: AppState): Record<SharedField, string> {
  const results = getResults(state.quiz)
  return {
    goal: state.memo.goal || '相談しながら決めたい',
    when: state.memo.when || '日時も含めて相談したい',
    vehicle: state.memo.vehicle,
    questions: state.memo.questions || '相談時に整理したい',
    experience: state.quiz.experience || '未回答',
    concerns: state.quiz.concerns.join('・') || '未選択',
    knowledge: `知識を確認：${results.known.join('・') || 'なし'} / 復習：${results.review.join('・') || 'なし'} / 未確認：${results.unchecked.join('・') || 'なし'}（実技評価ではありません）`,
  }
}
export function SharingReview() {
  const { id } = useParams()
  const school = schoolFromId(id)
  const { state, update } = useApp()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<SharedField[]>(['goal', 'when', 'vehicle', 'questions'])
  const [consent, setConsent] = useState(false)
  const sending = useRef(false)
  if (!school)
    return (
      <>
        <Header back />
        <EmptyState
          title="相談先が見つかりません"
          description="講習一覧からお選びください。"
          action="講習を探す"
          onAction={() => navigate('/schools')}
        />
      </>
    )
  const values = sharedValues(state)
  const send = () => {
    if (!consent || !selected.length || sending.current) return
    sending.current = true
    const consultationId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const snapshot = Object.fromEntries(selected.map((key) => [key, values[key]]))
    update((s) => ({
      ...s,
      consultations: [
        {
          id: consultationId,
          schoolId: school.id,
          createdAt,
          status: '送信済み（デモ）',
          consentAt: createdAt,
          shared: selected,
          snapshot,
        },
        ...s.consultations,
      ],
    }))
    navigate(`/consultations/${consultationId}`, { replace: true })
  }
  return (
    <div className="screen">
      <Header back title="共有内容の確認" />
      <div className="page-pad">
        <div className="consult-progress">
          <span>1 メモを作成</span>
          <ArrowRight size={13} />
          <span className="active">2 共有を確認</span>
        </div>
        <h1>
          伝えることは、
          <br />
          あなたが選べます。
        </h1>
        <p className="body-copy">共有先と内容を、最後に確認しましょう。</p>
        <div className="recipient-card">
          <ShieldCheck size={23} />
          <span>
            <small>共有先 · サンプルの講習会社</small>
            <strong>{school.name}</strong>
          </span>
        </div>
        <div className="sharing-items">
          {(Object.keys(sharingLabels) as SharedField[]).map((key) => (
            <Choice
              key={key}
              title={sharingLabels[key]}
              description={values[key]}
              selected={selected.includes(key)}
              onClick={() => {
                setSelected(
                  selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
                )
                setConsent(false)
              }}
            />
          ))}
        </div>
        <div className="notice">
          このモックでは端末内にデモの送信履歴を保存します。外部への送信・実際の予約は行いません。
        </div>
        <p className="disclosure">
          本実装では共有先・保管期間・削除窓口、掲載・紹介報酬を案内します。今回の保存データは設定から削除できます。
        </p>
        <label className="consent-checkbox">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>共有先と選択した内容を確認し、デモの送信記録を作成することに同意します。</span>
        </label>
        <PrimaryButton disabled={!consent || !selected.length} icon={Send} onClick={send}>
          この内容で相談する（デモ）
        </PrimaryButton>
        <PrimaryButton variant="ghost" onClick={() => navigate(`/consult/${school.id}`)}>
          相談メモを修正
        </PrimaryButton>
      </div>
    </div>
  )
}
export function ConsultationStatus() {
  const { id } = useParams()
  const { state, update, toast } = useApp()
  const navigate = useNavigate()
  const item = state.consultations.find((c) => c.id === id)
  const [showShared, setShowShared] = useState(false)
  if (!item)
    return (
      <>
        <Header back />
        <EmptyState
          title="相談履歴が見つかりません"
          description="プロフィールから履歴を確認できます。"
          action="相談履歴へ"
          onAction={() => navigate('/profile/consultations')}
        />
      </>
    )
  const school = schoolFromId(item.schoolId)
  const accepted = item.status === '相談受付（デモ）'
  const cancelled = item.status === 'キャンセル（デモ）'
  return (
    <div className="screen">
      <Header back title="相談の受付状態" />
      <div className="page-pad">
        <div className="status-intro">
          <div className="success-icon">
            <CheckCircle2 size={43} strokeWidth={1.4} />
          </div>
          <Tag>{item.status}</Tag>
          <h1>
            {cancelled ? (
              <>相談を取り下げました。</>
            ) : accepted ? (
              <>
                相談を受け付けた
                <br />
                状態のサンプルです。
              </>
            ) : (
              <>
                相談の一歩、
                <br />
                踏み出しました。
              </>
            )}
          </h1>
          <p>
            このモックでは、外部に送信していません。
            <br />
            講習の予約は確定していません。
          </p>
        </div>
        <div className="recipient-card">
          <MessageCircle size={23} />
          <span>
            <small>相談先</small>
            <strong>{school?.name}</strong>
          </span>
        </div>
        <div className="status-timeline">
          <div className="done">
            <Check size={16} />
            <span>
              共有内容を確認・同意<small>{new Date(item.consentAt).toLocaleString('ja-JP')}</small>
            </span>
          </div>
          <div className="done">
            <Check size={16} />
            <span>相談送信のデモ記録を保存</span>
          </div>
          <div className={accepted ? 'done' : ''}>
            <Clock3 size={16} />
            <span>
              {accepted
                ? '相談受付（デモ）'
                : cancelled
                  ? '取り下げ済み（デモ）'
                  : '講習会社からの受付待ち（デモ）'}
              <small>この後、日程や講習内容を相談する想定です。</small>
            </span>
          </div>
        </div>
        <PrimaryButton variant="secondary" onClick={() => setShowShared(true)}>
          共有した内容を確認
        </PrimaryButton>
        {!accepted && !cancelled && (
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              update((s) => ({
                ...s,
                consultations: s.consultations.map((c) =>
                  c.id === id ? { ...c, status: '相談受付（デモ）' } : c,
                ),
              }))
              toast('受付後の表示に切り替えました')
            }}
          >
            受付後の表示を試す
          </PrimaryButton>
        )}
        <PrimaryButton icon={BookIcon} onClick={() => navigate('/learn')}>
          待っている間に、少し予習
        </PrimaryButton>
        <PrimaryButton variant="ghost" onClick={() => navigate('/profile/consultations')}>
          相談履歴を見る
        </PrimaryButton>
        {!cancelled && (
          <button
            className="text-button centered muted"
            onClick={() => {
              update((s) => ({
                ...s,
                consultations: s.consultations.map((c) =>
                  c.id === id ? { ...c, status: 'キャンセル（デモ）' } : c,
                ),
              }))
              toast('デモの相談を取り下げました')
            }}
          >
            相談を取り下げる（デモ）
          </button>
        )}
      </div>
      {showShared && (
        <BottomSheet title="この相談で共有した内容" onClose={() => setShowShared(false)}>
          <InfoRows
            rows={item.shared.map((key) => [sharingLabels[key], item.snapshot[key] || '未記入'])}
          />
          <p className="muted small">
            同意日時：{new Date(item.consentAt).toLocaleString('ja-JP')}
          </p>
          <PrimaryButton onClick={() => setShowShared(false)}>閉じる</PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
const BookIcon = BookOpen
