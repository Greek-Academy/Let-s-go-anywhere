import { evaluateOuting, occursThisWeekend, outingStateLabels } from '../domain/outingLifecycle'
import { OutingImage, OutingStatus } from '../components/OutingStatus'
import { useContent, useContentTime } from '../content/ContentProvider'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CarFront,
  ChevronDown,
  ExternalLink,
  Heart,
  Link2,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { normalizeSavedUrl, savedUrlKey } from '../domain/savedUrls'

import type { Outing } from '../data/types'
import { useApp } from '../state/AppState'
import { ConditionsSheet, ConditionReasons, OutingConditions } from '../components/TripConditions'
import {
  evaluateConditions,
  hasConditions,
  overallMatch,
  matchLabels,
} from '../domain/tripConditions'
import type { ConditionFilter } from '../domain/tripConditions'

import { ArrivalTeaser } from './Arrival'
import { EventCard } from '../components/Cards'
import {
  BottomSheet,
  Chip,
  EmptyState,
  ExternalModal,
  Header,
  IconButton,
  InfoRows,
  PrimaryButton,
  SampleNote,
  SectionHeading,
  Tag,
  useBack,
} from '../components/ui'

export function SnsSheet({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useApp()
  const navigate = useNavigate()
  const errorId = useId()
  const [duplicate, setDuplicate] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    try {
      const normalized = normalizeSavedUrl(url)
      if (state.links.some((l) => savedUrlKey(l.url) === normalized.key)) {
        setDuplicate(true)
        setError('この投稿はすでに保存されています。保存済みの内容を確認できます。')
        return
      }
      const { url: clean, source } = normalized
      update((s) => ({
        ...s,
        links: [
          ...s.links,
          {
            id: crypto.randomUUID(),
            url: clean,
            originalUrl: url.trim(),
            title: title.trim() || `${source}で見つけたお出かけ`,
            source,
            addedAt: new Date().toISOString(),
          },
        ],
      }))
      toast('リンクを行きたいに保存しました')
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'URLを確認してください。')
    }
  }
  return (
    <BottomSheet title="SNSで見つけた場所を追加" onClose={onClose}>
      <div className="sns-intro">
        <div className="round-icon">
          <Link2 size={26} />
        </div>
        <p>
          その「行ってみたい」を、
          <br />
          ここに残しておきましょう。
        </p>
      </div>
      <form onSubmit={submit} noValidate>
        <label className="field-label">
          投稿のURL
          <input
            autoFocus
            type="url"
            maxLength={2048}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setDuplicate(false)
              setError('')
            }}
            placeholder="https://www.tiktok.com/..."
            required
          />
        </label>
        <label className="field-label">
          自分用のタイトル <span>任意</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="気になっていた海辺のカフェ"
            maxLength={80}
          />
        </label>
        {error && (
          <p className="field-error" role="alert" id={errorId}>
            {error}
          </p>
        )}
        {duplicate && (
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              onClose()
              navigate('/saved?type=events')
            }}
          >
            保存済みリンクを見る
          </PrimaryButton>
        )}
        <div className="notice">
          「リンクとして保存・内容未確認」で残します。開催日や場所を自動で補完することはありません。
        </div>
        <PrimaryButton type="submit" icon={Plus}>
          行きたいに追加
        </PrimaryButton>
      </form>
    </BottomSheet>
  )
}
export function Discover() {
  const { outings, tripFacts } = useContent()
  const now = useContentTime()
  const { state, update } = useApp()
  const navigate = useNavigate()
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const [sns, setSns] = useState(false)
  const [filter, setFilter] = useState(false)
  const [reason, setReason] = useState<Outing | null>(null)
  const [areaOpen, setAreaOpen] = useState(false)
  const [areaDraft, setAreaDraft] = useState(state.profile.area)
  const { category, search, tag } = state.discover
  const setFilterState = (value: Partial<typeof state.discover>) =>
    update((s) => ({ ...s, discover: { ...s.discover, ...value } }))
  const conditionsActive = hasConditions(state.searchConditions)
  const matchResults = (id: string) =>
    evaluateConditions(state.searchConditions, tripFacts[id], state.profile.area)
  const candidates = outings
    .filter(
      (o) =>
        evaluateOuting(o, now).recommendable &&
        !state.hiddenEvents.includes(o.id) &&
        (category === 'おすすめ' ||
          (category === '今週末' && occursThisWeekend(o, now)) ||
          (category === 'イベント' && o.kind === 'event') ||
          (category === 'スポット' && o.kind === 'spot')) &&
        (!tag || o.tags.includes(tag)) &&
        (!search || `${o.title}${o.area}${o.tags.join('')}`.includes(search)),
    )
    .sort(
      (a, b) =>
        b.tags.filter((t) => state.profile.interests.includes(t)).length -
        a.tags.filter((t) => state.profile.interests.includes(t)).length,
    )
  const filtered = candidates.filter(
    (o) =>
      !conditionsActive ||
      state.conditionFilter === 'all' ||
      overallMatch(matchResults(o.id)) === state.conditionFilter,
  )
  const openCars = () => {
    update((s) => ({ ...s, map: { ...s.map, area: s.profile.area, query: '', selected: null } }))
    navigate('/cars')
  }
  return (
    <div className="screen discover-screen">
      <Header />
      <div className="page-pad">
        <button
          className="location-select"
          onClick={() => {
            setAreaDraft(state.profile.area)
            setAreaOpen(true)
          }}
        >
          <MapPin size={14} />
          {state.profile.area || '出発エリアを設定'}
          <ChevronDown size={13} />
        </button>
        <div className="discover-title">
          <h1>今度の休日、どこに行く？</h1>
        </div>
        <p className="discover-lead">あなたの「好き」から、楽しみを見つけよう。</p>
        <div className="discover-search-row">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="お出かけを検索"
              value={search}
              onChange={(e) => setFilterState({ search: e.target.value })}
              placeholder="気になる場所や、したいこと"
            />
          </label>
          <IconButton
            icon={SlidersHorizontal}
            label="お出かけの絞り込み"
            className={`filter-button ${tag ? 'has-filter' : ''}`}
            onClick={() => setFilter(true)}
          />
        </div>
        <button
          className="condition-edit-button discovery-conditions"
          onClick={() => setConditionsOpen(true)}
        >
          <SlidersHorizontal size={18} />
          <span>
            <strong>今回のお出かけ条件</strong>
            <small>
              {conditionsActive ? '時間・予算・避けたい場面を変更' : '無理のない休日の条件を決める'}
            </small>
          </span>
          <ChevronDown size={16} />
        </button>
        {conditionsActive && (
          <div className="condition-filter">
            <p className="small muted">確認状態で絞り込み（架空の条件データ）</p>
            <div className="chips wrap">
              {(
                [
                  ['all', 'すべて'],
                  ['match', '確認済みで合う'],
                  ['unknown', '未確認'],
                  ['mismatch', '合わない'],
                ] as [ConditionFilter, string][]
              ).map(([value, label]) => (
                <Chip
                  key={value}
                  selected={state.conditionFilter === value}
                  onClick={() => update((s) => ({ ...s, conditionFilter: value }))}
                >
                  {label}{' '}
                  {
                    candidates.filter(
                      (o) => value === 'all' || overallMatch(matchResults(o.id)) === value,
                    ).length
                  }
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="chips discovery-chips">
          {['おすすめ', '今週末', 'イベント', 'スポット'].map((c) => (
            <Chip selected={c === category} key={c} onClick={() => setFilterState({ category: c })}>
              {c}
            </Chip>
          ))}
        </div>
        <SampleNote>
          {category === '今週末'
            ? '今週末に期間が重なる架空のイベントです。'
            : 'お出かけ情報はすべてサンプルです。'}
        </SampleNote>
        <SectionHeading
          title={
            tag
              ? `${tag}を楽しむ休日`
              : category === 'おすすめ'
                ? 'あなたへのおすすめ'
                : category === '今週末'
                  ? '今週末の楽しみ'
                  : category === 'イベント'
                    ? '季節のイベント'
                    : 'いつか行きたいスポット'
          }
          subtitle={
            state.profile.interests.length && category === 'おすすめ'
              ? `${state.profile.interests.slice(0, 2).join('・')}が好きなあなたへ`
              : 'いつもの休日に、小さな冒険を。'
          }
        />
        <div className="event-list">
          {filtered.map((o) => (
            <div key={o.id}>
              <EventCard outing={o} onMore={() => setReason(o)} />
              {conditionsActive && (
                <button className="condition-summary" onClick={() => setReason(o)}>
                  <Tag tone={overallMatch(matchResults(o.id)) === 'mismatch' ? 'peach' : 'neutral'}>
                    {matchLabels[overallMatch(matchResults(o.id))]}
                  </Tag>{' '}
                  条件の理由を見る <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <EmptyState
            title="ぴったりの候補が見つかりません"
            description={
              conditionsActive
                ? '未確認や合わない理由も確認できます。条件の見直しや、別の候補・移動方法を検討してみましょう。'
                : '検索する言葉や興味の条件を変えてみましょう。'
            }
            action={conditionsActive ? 'すべての確認状態を見る' : '条件をリセット'}
            onAction={() =>
              update((s) => ({
                ...s,
                discover: { category: 'おすすめ', search: '', tag: '' },
                conditionFilter: 'all',
              }))
            }
          />
        )}
        <button className="sns-banner" onClick={() => setSns(true)}>
          <span className="sns-banner-icon">
            <Link2 size={21} />
          </span>
          <span>
            <strong>SNSで見つけた「行きたい」も。</strong>
            <small>リンクを貼って、楽しみをひとつ追加</small>
          </span>
          <Plus size={18} />
        </button>
        <button className="car-banner" onClick={openCars}>
          <CarFront size={31} strokeWidth={1.4} />
          <span>
            <strong>出発地の近くで、車を探す</strong>
            <small>レンタカー・カーシェアの場所を確認</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <div className="page-signoff">
          <Sparkles size={16} />
          <p>
            いつか、じゃなくて
            <br />
            <strong>今度の休日に。</strong>
          </p>
        </div>
      </div>
      {conditionsOpen && (
        <ConditionsSheet
          value={state.searchConditions}
          onClose={() => setConditionsOpen(false)}
          onSave={(v) => update((s) => ({ ...s, searchConditions: v, conditionFilter: 'all' }))}
        />
      )}
      {sns && <SnsSheet onClose={() => setSns(false)} />}
      {filter && (
        <BottomSheet title="お出かけの絞り込み" onClose={() => setFilter(false)}>
          <h3>どんな休日にしたい？</h3>
          <div className="chips wrap filter-chips">
            {['', '自然', 'グルメ', '温泉', 'アウトドア', '季節イベント', '買い物'].map((t) => (
              <Chip key={t} selected={tag === t} onClick={() => setFilterState({ tag: t })}>
                {t || 'すべて'}
              </Chip>
            ))}
          </div>
          <PrimaryButton onClick={() => setFilter(false)}>この条件で表示</PrimaryButton>
          <PrimaryButton
            variant="ghost"
            onClick={() => setFilterState({ tag: '', search: '', category: 'おすすめ' })}
          >
            条件をリセット
          </PrimaryButton>
        </BottomSheet>
      )}
      {reason && (
        <BottomSheet title="このお出かけについて" onClose={() => setReason(null)}>
          <h3>{reason.title}</h3>
          {conditionsActive && <ConditionReasons results={matchResults(reason.id)} />}
          <p className="body-copy">
            {reason.tags.some((t) => state.profile.interests.includes(t))
              ? `登録した「${reason.tags.filter((t) => state.profile.interests.includes(t)).join('・')}」に合うお出かけサンプルです。`
              : '休日のアイデアとして、編集部が選んだサンプルです。'}
          </p>
          <InfoRows
            rows={[
              ['発見元', `${reason.source}（サンプル）`],
              ['掲載情報', '実際の開催・営業は未確認'],
            ]}
          />
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              update((s) => ({ ...s, hiddenEvents: [...s.hiddenEvents, reason.id] }))
              setReason(null)
            }}
          >
            興味がない・おすすめから外す
          </PrimaryButton>
        </BottomSheet>
      )}
      {areaOpen && (
        <BottomSheet title="出発エリアを変更" onClose={() => setAreaOpen(false)}>
          <label className="field-label">
            駅名・地域名
            <input value={areaDraft} onChange={(e) => setAreaDraft(e.target.value)} />
          </label>
          <p className="body-copy">手動の指定だけで利用できます。</p>
          <PrimaryButton
            disabled={!areaDraft.trim()}
            onClick={() => {
              update((s) => ({ ...s, profile: { ...s.profile, area: areaDraft.trim() } }))
              setAreaOpen(false)
            }}
          >
            このエリアから探す
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
export function EventDetail() {
  const { outings } = useContent()
  const now = useContentTime()
  const { id } = useParams()
  const outing = outings.find((o) => o.id === id)
  const navigate = useNavigate()
  const back = useBack()
  const location = useLocation()
  const { state, update, toggleEvent, toast } = useApp()
  const [external, setExternal] = useState<'official' | 'map' | 'sns' | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const saved = state.savedEvents.includes(id ?? '')
  if (!outing)
    return (
      <>
        <Header back title="お出かけ" />
        <EmptyState
          title="お出かけが見つかりません"
          description="一覧から、別のお出かけを探せます。"
          action="見つけるに戻る"
          onAction={() => navigate('/discover')}
        />
      </>
    )
  const status = evaluateOuting(outing, now)
  if (status.state === 'withdrawn')
    return (
      <div className="screen">
        <Header back title="お出かけ" />
        <div className="page-pad">
          <h1>このお出かけは掲載停止中です</h1>
          <OutingStatus outing={outing} detail />
          <p className="body-copy">以前の紹介・写真・アクセス情報は表示していません。</p>
          {saved && (
            <PrimaryButton variant="secondary" onClick={() => toggleEvent(outing.id)}>
              行きたいから外す
            </PrimaryButton>
          )}
          <PrimaryButton onClick={() => navigate('/discover')}>ほかのお出かけを探す</PrimaryButton>
        </div>
      </div>
    )
  const goal = state.goals[outing.id] ?? { companion: state.profile.companion, when: '', note: '' }
  const setGoal = (patch: Partial<typeof goal>) =>
    update((s) => ({ ...s, goals: { ...s.goals, [outing.id]: { ...goal, ...patch } } }))
  return (
    <div className="screen event-detail">
      <div className="detail-hero">
        <OutingImage outing={outing} />
        <div className="detail-hero-shade" />
        <div className="detail-hero-actions">
          <IconButton icon={ArrowLeft} label="戻る" onClick={back} />
          <div>
            <IconButton
              icon={Heart}
              label={saved ? '行きたいから外す' : '行きたいに保存'}
              className={saved ? 'heart-active' : ''}
              aria-pressed={saved}
              onClick={() => toggleEvent(outing.id)}
            />
            <IconButton
              icon={MoreHorizontal}
              label="情報源を確認"
              onClick={() => setExternal('official')}
            />
          </div>
        </div>
        <span className="hero-label">{outing.mood}</span>
      </div>
      <div className="detail-body page-pad">
        <div className="tags">
          {outing.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          <Tag tone="neutral">サンプル</Tag>
        </div>
        <h1>{outing.title}</h1>
        <p className="detail-subtitle">{outing.subtitle}</p>
        <OutingStatus outing={outing} detail />
        <div className="detail-meta">
          <p>
            <MapPin size={15} />
            {outing.area}
          </p>
          <p>
            <CalendarDays size={15} />
            {status.dateLabel}
          </p>
        </div>
        <p className="body-copy">{outing.description}</p>
        <PrimaryButton
          icon={Heart}
          variant={saved ? 'secondary' : 'primary'}
          onClick={() => toggleEvent(outing.id)}
        >
          {saved ? '行きたいに保存済み' : '行きたいに保存'}
        </PrimaryButton>
        <button className="text-button goal-link" onClick={() => setGoalOpen(true)}>
          <Plus size={15} />
          誰と・いつ・何をしたいかをメモ
        </button>
        <div className="divider" />
        <SectionHeading
          title="このお出かけに向けて"
          subtitle="楽しみが見つかったら、あなたのペースで。"
        />
        <div className="preparation-card">
          <span className="round-icon">
            <BookSymbol />
          </span>
          <div>
            <h3>運転の準備を、ひとつずつ。</h3>
            <p>
              知識や気になることを整理して、
              <br />
              学習や講師への相談につなげます。
            </p>
          </div>
        </div>
        <PrimaryButton
          icon={ArrowRight}
          onClick={() => {
            update((s) => ({ ...s, memo: { ...s.memo, goal: goal.note || outing.title } }))
            navigate('/check', {
              state: { outingId: outing.id, tab: location.state?.tab || 'discover' },
            })
          }}
        >
          運転の準備を確認
        </PrimaryButton>
        <PrimaryButton
          icon={CarFront}
          variant="secondary"
          onClick={() => {
            update((s) => ({
              ...s,
              map: { ...s.map, area: s.profile.area, query: '', selected: null },
            }))
            navigate('/cars')
          }}
        >
          出発地で車を探す
        </PrimaryButton>
        <button className="text-button centered" onClick={() => navigate('/schools')}>
          チェックをせずに講習を探す <ArrowRight size={14} />
        </button>
        <div className="divider" />
        <ArrivalTeaser outingId={outing.id} />
        <OutingConditions outingId={outing.id} />
        <SectionHeading title="お出かけの基本情報" />
        <InfoRows
          rows={[
            ['開催状態', `${outingStateLabels[status.state]}（サンプル）`],
            ['日時・期間', status.dateLabel],
            ['開催地', outing.area],
            ['料金', outing.price],
            ['参加・予約条件', '未確認'],
            ['主催者・施設', 'サンプルのため未確認'],
            ['駐車場・車での所要時間', '要確認'],
            ['発見元', `${outing.source}（サンプル）`],
            [
              '情報確認日',
              status.checkedAt ? `${status.checkedAt}（架空の確認記録）` : '再確認が必要です',
            ],
          ]}
        />
        <PrimaryButton
          variant="secondary"
          icon={ExternalLink}
          onClick={() => setExternal('official')}
        >
          公式情報を見る
        </PrimaryButton>
        <PrimaryButton variant="secondary" icon={MapPin} onClick={() => setExternal('map')}>
          地図・アクセスを確認
        </PrimaryButton>
        {['X', 'TikTok'].includes(outing.source) && (
          <PrimaryButton variant="ghost" icon={Link2} onClick={() => setExternal('sns')}>
            関連SNS投稿を見る
          </PrimaryButton>
        )}
        <SampleNote />
      </div>
      {external && (
        <ExternalModal title={outing.title} kind={external} onClose={() => setExternal(null)} />
      )}
      {goalOpen && (
        <BottomSheet title="このお出かけのメモ" onClose={() => setGoalOpen(false)}>
          <label className="field-label">
            誰と行きたい？
            <input
              value={goal.companion}
              onChange={(e) => setGoal({ companion: e.target.value })}
              placeholder="恋人・パートナー"
            />
          </label>
          <label className="field-label">
            いつ頃？
            <input
              value={goal.when}
              onChange={(e) => setGoal({ when: e.target.value })}
              placeholder="10月の週末"
            />
          </label>
          <label className="field-label">
            実現したいこと
            <textarea
              value={goal.note}
              onChange={(e) => setGoal({ note: e.target.value })}
              placeholder="湖のそばで、のんびり過ごしたい"
            />
          </label>
          <PrimaryButton
            onClick={() => {
              if (!saved) update((s) => ({ ...s, savedEvents: [...s.savedEvents, outing.id] }))
              toast('お出かけのメモを保存しました')
              setGoalOpen(false)
            }}
          >
            メモを保存
          </PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
function BookSymbol() {
  return <Sparkles size={24} strokeWidth={1.5} />
}
