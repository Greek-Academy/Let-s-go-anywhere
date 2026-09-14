import type { Question } from '../data/types'
import { useContent } from '../content/ContentProvider'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  ListChecks,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { experiences, scenarios } from '../data/options'
import { useApp } from '../state/AppState'
import type { AppState } from '../state/AppState'
import { LessonCard } from '../components/Cards'
import { RoadScene } from '../components/RoadScene'
import {
  BottomSheet,
  Chip,
  Choice,
  EmptyState,
  Header,
  PrimaryButton,
  SampleNote,
  SectionHeading,
  Tag,
} from '../components/ui'

export function getResults(quiz: AppState['quiz'], quizQuestions: readonly Question[]) {
  const known = quizQuestions.filter((q) => quiz.answers[q.id] === q.correct).map((q) => q.category)
  const review = quizQuestions
    .filter((q) => typeof quiz.answers[q.id] === 'number' && quiz.answers[q.id] !== q.correct)
    .map((q) => q.category)
  const unchecked = scenarios.filter((c) => !known.includes(c) && !review.includes(c))
  return { known, review, unchecked, consultation: quiz.concerns }
}
export function CheckSetup() {
  const { state, update } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const quiz = state.quiz
  return (
    <div className="screen">
      <Header back title="知識・不安チェック" />
      <div className="page-pad">
        <div className="feature-icon">
          <ListChecks size={31} strokeWidth={1.4} />
        </div>
        <p className="eyebrow teal">A LITTLE STEP FORWARD</p>
        <h1>
          気になることから、
          <br />
          整理してみよう。
        </h1>
        <p className="body-copy">
          答えにくい項目は、スキップして大丈夫。
          <br />
          あなたの経験と、不安を分けて振り返ります。
        </p>
        {state.memo.goal && (
          <div className="goal-note">
            <Sparkles size={17} />
            <span>
              今の目標<strong>{state.memo.goal}</strong>
            </span>
          </div>
        )}
        <SectionHeading
          title="これまでの運転経験"
          subtitle="自己申告です。近いものを選んでください。"
        />
        <div className="choice-stack">
          {experiences.map((exp) => (
            <Choice
              key={exp}
              title={exp}
              selected={quiz.experience === exp}
              onClick={() => update((s) => ({ ...s, quiz: { ...s.quiz, experience: exp } }))}
            />
          ))}
        </div>
        <SectionHeading
          title="不安な場面はありますか？"
          subtitle="複数選択できます。未選択でも進められます。"
        />
        <div className="chips wrap concern-chips">
          {scenarios.map((c) => (
            <Chip
              selected={quiz.concerns.includes(c)}
              key={c}
              onClick={() =>
                update((s) => ({
                  ...s,
                  quiz: {
                    ...s.quiz,
                    concerns: s.quiz.concerns.includes(c)
                      ? s.quiz.concerns.filter((v) => v !== c)
                      : [...s.quiz.concerns, c],
                  },
                }))
              }
            >
              {c}
            </Chip>
          ))}
        </div>
        <div className="notice">
          <BookOpen size={17} />
          <span>
            次は短い知識チェックです。実車での操作や運転能力を評価するものではありません。
          </span>
        </div>
        <PrimaryButton
          icon={ArrowRight}
          onClick={() => navigate('/quiz/0', { state: location.state })}
        >
          {Object.keys(quiz.answers).length
            ? '回答を確認・続きから進める'
            : '知識チェックをはじめる'}
        </PrimaryButton>
        <PrimaryButton variant="ghost" onClick={() => navigate('/results')}>
          知識チェックをせずに整理を見る
        </PrimaryButton>
      </div>
    </div>
  )
}
export function Quiz() {
  const { quizQuestions } = useContent()
  const { index: raw } = useParams()
  const index = Number(raw)
  const q = quizQuestions[index]
  const navigate = useNavigate()
  const location = useLocation()
  const { state, update } = useApp()
  if (!q) return <Navigate to="/check" replace />
  const answer = state.quiz.answers[q.id]
  const goNext = (skip = false) => {
    update((s) => ({
      ...s,
      quiz: {
        ...s.quiz,
        answers: { ...s.quiz.answers, [q.id]: skip ? null : s.quiz.answers[q.id] },
        completed: index === quizQuestions.length - 1 ? true : s.quiz.completed,
      },
    }))
    navigate(index === quizQuestions.length - 1 ? '/results' : `/quiz/${index + 1}`, {
      state: location.state,
    })
  }
  return (
    <div className="screen quiz-screen">
      <Header
        back={() =>
          navigate(index > 0 ? `/quiz/${index - 1}` : '/check', { state: location.state })
        }
        title="知識チェック"
      />
      <div className="page-pad">
        <div className="quiz-progress">
          <span>
            QUESTION <strong>0{index + 1}</strong>
          </span>
          <span>
            {index + 1} / {quizQuestions.length}
          </span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${((index + 1) / quizQuestions.length) * 100}%` }} />
        </div>
        <div className="quiz-heading">
          <Tag>{q.category}</Tag>
          <h1>{q.title}</h1>
          <p>{q.prompt}</p>
        </div>
        <RoadScene key={q.id} scene={q.scene} interactive />
        <p className="question-label">あなたの考えに近いものを選んでください。</p>
        <div className="quiz-options">
          {q.options.map((option, i) => (
            <Choice
              key={option}
              title={option}
              selected={answer === i}
              icon={<span className="option-letter">{String.fromCharCode(65 + i)}</span>}
              onClick={() =>
                update((s) => ({
                  ...s,
                  quiz: { ...s.quiz, answers: { ...s.quiz.answers, [q.id]: i } },
                }))
              }
            />
          ))}
        </div>
        <div className="quiz-footer">
          <PrimaryButton
            icon={ArrowRight}
            disabled={typeof answer !== 'number'}
            onClick={() => goNext()}
          >
            {index === quizQuestions.length - 1 ? '結果と次の一歩を見る' : '次の問題へ'}
          </PrimaryButton>
          <button className="text-button centered" onClick={() => goNext(true)}>
            未回答のまま次へ
          </button>
        </div>
        <SampleNote>設問・解説は未監修のUIサンプルです。</SampleNote>
      </div>
    </div>
  )
}
export function Results() {
  const { quizQuestions } = useContent()
  const { state, update } = useApp()
  const navigate = useNavigate()
  const result = getResults(state.quiz, quizQuestions)
  const [explanationsOpen, setExplanationsOpen] = useState(false)
  const groups = [
    {
      title: '知識を確認できた項目',
      items: result.known,
      icon: CheckCircle2,
      tone: 'mint',
      empty: 'まだありません',
    },
    {
      title: '復習したい項目',
      items: result.review,
      icon: BookOpen,
      tone: 'peach',
      empty: '回答した範囲ではありません',
    },
    {
      title: '講師に相談したい項目',
      items: result.consultation,
      icon: MessageCircle,
      tone: 'blue',
      empty: '不安な場面は未選択です',
    },
    {
      title: '未確認',
      items: result.unchecked,
      icon: CircleHelp,
      tone: 'neutral',
      empty: 'このサンプルの項目は確認しました',
    },
  ]
  return (
    <div className="screen">
      <Header back title="チェックの振り返り" />
      <div className="page-pad">
        <div className="result-intro">
          <div className="result-flower">
            <Check size={31} strokeWidth={1.5} />
          </div>
          <p className="eyebrow teal">ONE STEP AT A TIME</p>
          <h1>
            次の一歩が、
            <br />
            少し見えてきました。
          </h1>
          <p>知識と気になることを、分けて整理しました。</p>
        </div>
        <div className="knowledge-counter">
          <BookOpen size={20} />
          <span>知識チェックの回答数</span>
          <strong>
            {quizQuestions.filter((q) => typeof state.quiz.answers[q.id] === 'number').length}
            <small> / {quizQuestions.length}問</small>
          </strong>
        </div>
        <div className="result-groups">
          {groups.map(({ title, items, icon: Icon, tone, empty }) => (
            <section key={title} className={`result-group ${tone}`}>
              <h2>
                <Icon size={18} />
                {title}
                <span>{items.length}</span>
              </h2>
              <p>{items.length ? items.join('・') : empty}</p>
            </section>
          ))}
        </div>
        <div className="experience-summary">
          <h3>
            運転経験 <Tag tone="neutral">自己申告</Tag>
          </h3>
          <p>{state.quiz.experience || '未回答'}</p>
        </div>
        <div className="notice">
          この結果は知識課題と自己申告の整理です。実車での技能や、安全性の判定ではありません。
        </div>
        <PrimaryButton
          variant="secondary"
          icon={ListChecks}
          onClick={() => setExplanationsOpen(true)}
        >
          回答ごとの解説を見る
        </PrimaryButton>
        <PrimaryButton
          icon={BookOpen}
          onClick={() => navigate('/learn', { state: { recommended: result.review } })}
        >
          おすすめの学習を見る
        </PrimaryButton>
        <PrimaryButton
          variant="secondary"
          icon={MessageCircle}
          onClick={() => navigate('/schools')}
        >
          講師に聞きたいことを相談する
        </PrimaryButton>
        <button
          className="text-button centered"
          onClick={() => {
            update((s) => ({ ...s, quiz: { ...s.quiz, answers: {}, completed: false } }))
            navigate('/check')
          }}
        >
          <RotateCcw size={14} />
          もう一度チェックする
        </button>
      </div>
      {explanationsOpen && (
        <BottomSheet title="回答と解説" onClose={() => setExplanationsOpen(false)}>
          <SampleNote>設問・回答例・解説は未監修のUIサンプルです。</SampleNote>
          <div className="answer-reviews">
            {quizQuestions.map((q, index) => {
              const answer = state.quiz.answers[q.id]
              return (
                <article key={q.id}>
                  <Tag tone="neutral">
                    問{index + 1} · {q.category}
                  </Tag>
                  <h3>{q.title}</h3>
                  <p>
                    <strong>あなたの回答</strong>
                    {typeof answer === 'number' ? q.options[answer] : '未回答'}
                  </p>
                  <p>
                    <strong>サンプルの回答例</strong>
                    {q.options[q.correct]}
                  </p>
                  <div className="answer-explanation">{q.explanation}</div>
                </article>
              )
            })}
          </div>
          <PrimaryButton onClick={() => setExplanationsOpen(false)}>振り返りに戻る</PrimaryButton>
        </BottomSheet>
      )}
    </div>
  )
}
export function Learn() {
  const { learningContents, quizQuestions } = useContent()
  const [use, setUse] = useState('すべて')
  const { state } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const recommended: string[] =
    location.state?.recommended ?? getResults(state.quiz, quizQuestions).review
  const filtered = learningContents
    .filter((l) => use === 'すべて' || l.uses.includes(use))
    .sort(
      (a, b) => Number(recommended.includes(b.category)) - Number(recommended.includes(a.category)),
    )
  return (
    <div className="screen learn-screen">
      <Header />
      <div className="page-pad">
        <p className="eyebrow teal">LEARN AT YOUR OWN PACE</p>
        <h1>
          楽しみの前に、
          <br />
          小さな準備を。
        </h1>
        <p className="body-copy">知ることから、次の一歩が始まります。</p>
        <div className="learning-summary">
          <div className="learning-summary-icon">
            <BookOpen size={31} strokeWidth={1.5} />
          </div>
          <div>
            <small>あなたの学習記録</small>
            <h3>
              {state.learned.length}
              <span> コンテンツを学習</span>
            </h3>
            <p>少しずつ、自分のペースで。</p>
          </div>
          <span className="learning-leaf">✳</span>
        </div>
        <div className="chips wrap learning-chips">
          {['すべて', '講習前の予習', '講習後の復習', 'お出かけ前の確認'].map((t) => (
            <Chip key={t} selected={use === t} onClick={() => setUse(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <SectionHeading
          title={recommended.length ? 'チェックに合わせた学習' : '今日の、ひとつだけでも。'}
          subtitle="1本3〜4分。読むことから始められます。"
        />
        <div className="lesson-list">
          {filtered.map((l) => (
            <LessonCard lesson={l} key={l.id} />
          ))}
        </div>
        <button className="check-banner" onClick={() => navigate('/check')}>
          <ListChecks size={26} />
          <span>
            <strong>何から始めるか、迷ったら。</strong>
            <small>知識と不安をチェックしてみる</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <SampleNote>学習内容は未監修のUIサンプルです。実際の教材ではありません。</SampleNote>
      </div>
    </div>
  )
}
export function LearningDetail() {
  const { learningContents } = useContent()
  const { id } = useParams()
  const lesson = learningContents.find((l) => l.id === id)
  const [params, setParams] = useSearchParams()
  const pageIndex = Math.max(
    0,
    Math.min(Number(params.get('page')) || 0, (lesson?.pages.length ?? 1) - 1),
  )
  const { state, update, toast } = useApp()
  const navigate = useNavigate()
  if (!lesson)
    return (
      <>
        <Header back title="学習" />
        <EmptyState
          title="教材が見つかりません"
          description="一覧から別の学習を選べます。"
          action="学習一覧に戻る"
          onAction={() => navigate('/learn')}
        />
      </>
    )
  const page = lesson.pages[pageIndex]
  const completed = state.learned.includes(lesson.id)
  const record = () => {
    update((s) => ({
      ...s,
      learned: s.learned.includes(lesson.id) ? s.learned : [...s.learned, lesson.id],
      learningDates: { ...s.learningDates, [lesson.id]: new Date().toISOString() },
    }))
    toast('学習したことを記録しました')
  }
  return (
    <div className="screen">
      <Header back title="学習と解説" />
      <div className="page-pad">
        <div className="tags">
          <Tag>{lesson.category}</Tag>
          <Tag tone="neutral">{lesson.time}分 · 読んで学ぶ</Tag>
          {completed && (
            <Tag>
              <Check size={12} />
              学習済み
            </Tag>
          )}
        </div>
        <h1 className="learning-detail-title">{lesson.title}</h1>
        <p className="body-copy">{lesson.introduction}</p>
        <RoadScene
          scene={
            lesson.category === '駐車'
              ? 'parking'
              : lesson.category === '高速道路'
                ? 'highway'
                : 'road'
          }
        />
        <div className="lesson-page-count">
          POINT 0{pageIndex + 1}
          <span>
            {pageIndex + 1} / {lesson.pages.length}
          </span>
        </div>
        <h2>{page.title}</h2>
        <p className="lesson-explanation">{page.text}</p>
        <div className="lesson-tip">
          <Sparkles size={19} />
          <div>
            <strong>講師に聞きたいことは、メモに。</strong>
            <p>分からないことが残っていても大丈夫。相談するときのヒントになります。</p>
          </div>
        </div>
        <PrimaryButton
          variant="secondary"
          icon={MessageCircle}
          onClick={() => {
            const text = `${lesson.category}：${page.title}について聞きたい`
            update((s) => ({
              ...s,
              memo: {
                ...s.memo,
                questions: s.memo.questions.includes(text)
                  ? s.memo.questions
                  : [s.memo.questions, text].filter(Boolean).join('\n'),
              },
            }))
            toast('相談メモに追加しました')
          }}
        >
          この内容を相談メモに追加
        </PrimaryButton>
        <div className="lesson-navigation">
          <PrimaryButton
            variant="secondary"
            icon={ArrowLeft}
            disabled={pageIndex === 0}
            onClick={() => setParams({ page: String(pageIndex - 1) }, { replace: true })}
          >
            前の問題
          </PrimaryButton>
          {pageIndex < lesson.pages.length - 1 ? (
            <PrimaryButton
              icon={ArrowRight}
              onClick={() => setParams({ page: String(pageIndex + 1) }, { replace: true })}
            >
              次の問題
            </PrimaryButton>
          ) : (
            <PrimaryButton icon={Check} onClick={record}>
              {completed ? '学習済み' : '学習を記録'}
            </PrimaryButton>
          )}
        </div>
        {completed && (
          <PrimaryButton variant="ghost" onClick={() => navigate('/learn')}>
            学習一覧へ戻る
          </PrimaryButton>
        )}
        <div className="editorial-note">
          <strong>UI確認用・未監修の解説サンプル</strong>
          <p>
            監修者・根拠資料・更新日は本実装で登録します。実際の運転指導や実技評価には使いません。
          </p>
        </div>
      </div>
    </div>
  )
}
