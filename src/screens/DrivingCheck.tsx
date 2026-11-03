import type { Question } from '../data/types'
import { useContent } from '../content/ContentProvider'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  ListChecks,
  MessageCircle,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import { experiences, scenarios } from '../data/options'
import { useApp } from '../state/AppState'
import type { AppState } from '../state/AppState'
import { RoadScene } from '../components/RoadScene'
import {
  BottomSheet,
  Chip,
  Choice,
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
  return { known, review, unchecked, concerns: quiz.concerns }
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
      title: '練習で確認したい項目',
      items: result.concerns,
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
        <PrimaryButton icon={ArrowRight} onClick={() => navigate('/discover')}>
          ドライブ先を探す
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
