import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Copy, Download, House } from 'lucide-react'
import { Share } from '@capacitor/share'
import { Header, IconButton, PrimaryButton } from '../components/ui'
import { useApp } from '../state/AppState'
import { isNativeApp } from '../platform/runtime'
import { AxisCard, Bowl, RamenPhoto, SourceLink } from './components'
import { answerLabels, answerSymbols, profile, questions, resultFor, scoring } from './data'
import type { RamenAnswer } from './model'
import sources from './sources.json'
import './ramen.css'

function Progress() {
  const { state, storagePending, storageProblem, memoryOnly } = useApp()
  const count = Object.keys(state.ramen.answers).length
  return (
    <div className="ramen-progress">
      <div>
        <span>{count} / 100枚 回答済み</span>
        <small>
          {memoryOnly
            ? '確認画面内のみ'
            : storageProblem
              ? '端末に保存できていません'
              : storagePending
                ? '保存中…'
                : 'この端末に保存済み'}
        </small>
      </div>
      <progress max={100} value={count} aria-label="診断の回答進捗" />
    </div>
  )
}
function Intro() {
  const { state } = useApp()
  const navigate = useNavigate()
  const count = Object.keys(state.ramen.answers).length
  const start = () => {
    if (count === 100) return navigate('/ramen/result')
    const cursor = state.ramen.cursor
    const next = state.ramen.answers[questions[cursor].id]
      ? questions.findIndex((q) => !state.ramen.answers[q.id])
      : cursor
    navigate(`/ramen/question/${next + 1}`)
  }
  return (
    <>
      <div className="ramen-intro">
        <Bowl />
        <p className="ramen-eyebrow">100 PHOTOS. YOUR OWN TASTE.</p>
        <h1>
          その「好き」に、
          <br />
          名前をつけよう。
        </h1>
        <p>
          写真を見て、⭕️・🔺・❌。
          <br />
          あなたの一杯タイプと、
          <br />
          好みを表す言葉が見つかります。
        </p>
        <div className="ramen-tags">
          <span>写真100枚</span>
          <span>16タイプ</span>
          <span>途中保存OK</span>
        </div>
      </div>
      {count > 0 && <Progress />}
      <PrimaryButton icon={ArrowRight} onClick={start}>
        {count === 100 ? '診断結果を見る' : count ? '続きから回答する' : '診断をはじめる'}
      </PrimaryButton>
      {count > 0 && (
        <PrimaryButton variant="secondary" onClick={() => navigate('/ramen/review')}>
          回答を見直す
        </PrimaryButton>
      )}
      <section className="ramen-section">
        <h2>「この一杯、好き？」で選ぶだけ。</h2>
        <p>
          店名・価格・口コミ評価は表示しません。写真の一杯に惹かれるかどうか、直感で選んでください。
        </p>
        <p>
          🔺は「どちらともいえない」という中間の評価です。写真が見られない場合の「読込不可」は、採点から除きます。
        </p>
        <p>
          100枚を同じ順序で出題します。目安は8〜12分。途中でホームへ戻っても、保存した回答から再開できます。
        </p>
        <p className="ramen-muted">
          写真への好みを整理する独自の診断です。性格や実際の味の好み、診断の正確さを測るものではありません。回答は端末内に保存し、AI検索や共有リストへ自動送信しません。
        </p>
      </section>
      <PrimaryButton variant="ghost" onClick={() => navigate('/ramen/about')}>
        診断の仕組み・写真の出典
      </PrimaryButton>
    </>
  )
}
function Question() {
  const { index: raw } = useParams()
  const index = Number(raw) - 1
  if (!/^\d+$/.test(raw ?? '') || !Number.isInteger(index) || index < 0 || index >= 100)
    return <Navigate to="/ramen" replace />
  return <QuestionCard key={questions[index].id} index={index} />
}
function QuestionCard({ index }: { index: number }) {
  const { state, update } = useApp()
  const navigate = useNavigate()
  const [photoStatus, setPhotoStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const q = questions[index]
  const selected = state.ramen.answers[q.id]
  const complete = Object.keys(state.ramen.answers).length === 100
  useEffect(() => {
    update((s) => (s.ramen.cursor === index ? s : { ...s, ramen: { ...s.ramen, cursor: index } }))
  }, [index, update])
  const choose = (value: RamenAnswer) =>
    update((s) => ({ ...s, ramen: { ...s.ramen, answers: { ...s.ramen.answers, [q.id]: value } } }))
  const next = () => navigate(index === 99 ? '/ramen/result' : `/ramen/question/${index + 2}`)
  const canContinue = selected === 'skip' || (photoStatus === 'ready' && !!selected)
  return (
    <>
      <div className="ramen-question-heading">
        <p className="ramen-eyebrow">PHOTO {String(index + 1).padStart(3, '0')} / 100</p>
        <h1>この一杯、好きですか？</h1>
      </div>
      <Progress />
      <RamenPhoto id={q.photo_id} label={`写真${index + 1}`} onStatus={setPhotoStatus} />
      <p className="ramen-muted ramen-center">見た目に惹かれるか、直感で選んでください。</p>
      <div className="ramen-answers" role="group" aria-label="写真への好み">
        {(['yes', 'maybe', 'no'] as const).map((value) => (
          <button
            key={value}
            disabled={photoStatus !== 'ready'}
            aria-pressed={selected === value}
            onClick={() => choose(value)}
          >
            <span aria-hidden="true">{answerSymbols[value]}</span>
            <strong>{answerLabels[value]}</strong>
          </button>
        ))}
      </div>
      {selected === 'skip' && (
        <p className="ramen-muted">
          この写真は「読込不可」として記録しています。🔺には含めません。
        </p>
      )}
      {photoStatus === 'error' && (
        <PrimaryButton
          variant="secondary"
          onClick={() => {
            choose('skip')
            next()
          }}
        >
          読込不可として進む
        </PrimaryButton>
      )}
      <div className="ramen-question-actions">
        <PrimaryButton
          variant="secondary"
          icon={ArrowLeft}
          disabled={index === 0}
          onClick={() => navigate(`/ramen/question/${index}`)}
        >
          前の写真
        </PrimaryButton>
        <PrimaryButton icon={ArrowRight} disabled={!canContinue} onClick={next}>
          {index === 99 ? '結果を見る' : '次の写真へ'}
        </PrimaryButton>
      </div>
      {complete && (
        <PrimaryButton variant="secondary" onClick={() => navigate('/ramen/result')}>
          結果を更新して戻る
        </PrimaryButton>
      )}
      <PrimaryButton variant="ghost" onClick={() => navigate('/ramen/review')}>
        回答一覧を確認
      </PrimaryButton>
      <p className="ramen-muted ramen-center">休憩しても大丈夫。回答は選ぶたびに保存されます。</p>
    </>
  )
}
function Review() {
  const { state } = useApp()
  const navigate = useNavigate()
  const count = Object.keys(state.ramen.answers).length
  return (
    <>
      <h1>回答を見直す</h1>
      <p>番号を押すと、その写真に戻ります。回答を変えると結果も再計算されます。</p>
      <Progress />
      <PrimaryButton
        onClick={() =>
          navigate(
            count === 100
              ? '/ramen/result'
              : `/ramen/question/${questions.findIndex((q) => !state.ramen.answers[q.id]) + 1}`,
          )
        }
      >
        {count === 100 ? '結果に戻る' : '未回答から再開'}
      </PrimaryButton>
      <div className="ramen-review-grid">
        {questions.map((q, index) => {
          const value = state.ramen.answers[q.id]
          return (
            <button
              key={q.id}
              className={value ? 'ramen-answered' : ''}
              aria-label={`写真${index + 1} ${value ? answerLabels[value] : '未回答'}`}
              onClick={() => navigate(`/ramen/question/${index + 1}`)}
            >
              {index + 1}
              <span aria-hidden="true">{value ? answerSymbols[value] : '・'}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
function ResultActions({ text }: { text: string }) {
  const { toast } = useApp()
  const [copyFallback, setCopyFallback] = useState(false)
  const save = async () => {
    try {
      if (isNativeApp) {
        await Share.share({ title: 'ラーメンタイプ診断の結果', text })
        return
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'ramen-preference-result.txt'
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('結果のテキストを保存しました')
    } catch {
      toast('保存を完了しませんでした。結果はこの画面で確認できます。')
    }
  }
  return (
    <>
      <div className="ramen-result-actions">
        <PrimaryButton
          icon={Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              toast('結果をコピーしました')
            } catch {
              setCopyFallback(true)
            }
          }}
        >
          結果をコピー
        </PrimaryButton>
        <PrimaryButton variant="secondary" icon={Download} onClick={() => void save()}>
          {isNativeApp ? '共有・テキスト保存' : 'テキストで保存'}
        </PrimaryButton>
      </div>
      {copyFallback && (
        <label className="ramen-copy-fallback">
          長押し、または文字を選択してコピーしてください。
          <textarea
            readOnly
            value={text}
            aria-label="コピー用の診断結果"
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </>
  )
}
function Result() {
  const { state } = useApp()
  const navigate = useNavigate()
  const result = useMemo(() => resultFor(state.ramen), [state.ramen.answers])
  if (result.answered < 100) return <Navigate to="/ramen/review" replace />
  const exact = profile.types.find((t) => t.code === result.code)
  const closest = profile.types.find((t) => t.code === result.closest_code)
  const type = exact ?? closest
  const title = exact
    ? exact.name
    : closest
      ? `${closest.name}寄り`
      : !result.enoughVariation
        ? '今回はタイプを保留'
        : 'いくつかのタイプのあいだ'
  return (
    <>
      <div className="ramen-result-hero">
        <p className="ramen-eyebrow">YOUR RAMEN PREFERENCE</p>
        <Bowl code={type?.code} />
        <p>
          {exact
            ? '今回の写真から見えた、あなたのタイプ'
            : closest
              ? '今の回答で近いのは、このタイプ'
              : 'ひとつに決めないのも、好みのかたち'}
        </p>
        <h1>{title}</h1>
        <span className="ramen-type-code">{type?.code ?? '境界 / 保留'}</span>
        {closest && !exact && (
          <p className="ramen-muted">境界の特徴があるため、タイプ名は暫定です。</p>
        )}
        <p>
          ⭕️ {result.yes}　🔺 {result.maybe}　❌ {result.no}
          <br />
          <small>読込不可 {result.skipped}枚（採点から除外）</small>
        </p>
      </div>
      <article className="ramen-description">
        <p className="ramen-eyebrow">YOUR TASTE, IN WORDS</p>
        <h2>あなたの「好き」を言葉にすると</h2>
        {result.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </article>
      <ResultActions text={scoring.toText(result, profile)} />
      <PrimaryButton variant="ghost" onClick={() => navigate('/ramen/review')}>
        回答を見直す
      </PrimaryButton>
      <section className="ramen-section">
        <p className="ramen-eyebrow">01 / FOUR DIRECTIONS</p>
        <h2>どの特徴に、惹かれた？</h2>
        <p>
          ○＝100・△＝50・×＝0として集計した好みスコアを、0〜100%のバーで表示しています。
          <strong>「診断が当たる確率」ではありません。</strong>
        </p>
        <p className="ramen-muted">
          特徴の両側で、店ごとの平均点を均等に集計します。2本のバーを足して100%になるものではありません。
        </p>
        {result.axes.map((axis) => (
          <AxisCard key={axis.id} axis={axis} />
        ))}
      </section>
      {!exact && result.enoughVariation && (
        <section className="ramen-section">
          <h2>境界を含めた候補タイプ</h2>
          <p>差が小さい特徴や材料不足の特徴は、両側のタイプを候補に残します。</p>
          <div className="ramen-tags">
            {profile.types
              .filter((t) => result.candidate_codes.includes(t.code))
              .map((t) => (
                <span key={t.code}>
                  {t.name}（{t.code}）
                </span>
              ))}
          </div>
        </section>
      )}
      <section className="ramen-section">
        <p className="ramen-eyebrow">02 / YOUR DETAILS</p>
        <h2>タイプ名に収まらない、細かな好み</h2>
        <p>油・スープの色・麺の形なども、同じ方法で比べました。</p>
        {result.extras.map((axis) => (
          <AxisCard key={axis.id} axis={axis} />
        ))}
      </section>
      <details className="ramen-details">
        <summary>メニュー名から見える傾向・回答内訳</summary>
        <p>
          元の投稿で味の名前を確認できた写真だけを集計します。見た目への回答なので、実際の味の好みは断定しません。
        </p>
        {result.flavors.map((f) => (
          <article className="ramen-flavor" key={f.id}>
            <h3>
              {f.label} <span>{f.rate === null ? '—' : `${Math.round(f.rate * 100)}%`}</span>
            </h3>
            <p>
              ○ {f.yes}・△ {f.maybe}・× {f.no} ／ {f.n}枚・{f.restaurants}店
            </p>
            <small>{f.n >= 6 && f.restaurants >= 3 ? '比較可能' : '材料少なめ・参考値'}</small>
          </article>
        ))}
      </details>
      <section className="ramen-section">
        <p className="ramen-eyebrow">03 / YOUR CHOICES</p>
        <h2>あなたが選んだ写真</h2>
        <p>写真を拡大したり、その回答を変更したりできます。</p>
        {(['yes', 'maybe', 'no', 'skip'] as const).map((value) => {
          const entries = questions
            .map((q, index) => ({ ...q, index }))
            .filter((q) => state.ramen.answers[q.id] === value)
          return (
            <details className="ramen-details" key={value}>
              <summary>
                {answerSymbols[value]} {answerLabels[value]}（{entries.length}枚）
              </summary>
              <div className="ramen-sample-grid">
                {entries.map((q) => (
                  <div key={q.id}>
                    <RamenPhoto small id={q.photo_id} label={`写真${q.index + 1}`} />
                    <button
                      className="ramen-edit-answer"
                      onClick={() => navigate(`/ramen/question/${q.index + 1}`)}
                    >
                      写真{q.index + 1}の回答を変更
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </section>
      <details className="ramen-details">
        <summary>他の16タイプを見る</summary>
        <p>
          4つの特徴 ×
          2方向でつくった独自の分類です。タイプの典型像であり、あなた自身の分析文は上に表示しています。
        </p>
        <div className="ramen-types">
          {profile.types.map((t) => (
            <article
              className={`ramen-type ${t.code === result.code ? 'ramen-type-current' : ''}`}
              key={t.code}
            >
              <Bowl code={t.code} />
              <span className="ramen-type-code">
                {t.code}
                {t.code === result.code && ' / YOUR TYPE'}
              </span>
              <h3>{t.name}</h3>
              <p>{t.description}</p>
              <div className="ramen-tags">
                {t.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </details>
      <PrimaryButton variant="secondary" onClick={() => navigate('/ramen/about')}>
        診断の仕組み・写真の出典
      </PrimaryButton>
      <PrimaryButton icon={House} onClick={() => navigate('/discover')}>
        ホームに戻る
      </PrimaryButton>
    </>
  )
}
function About() {
  return (
    <>
      <h1>診断の仕組み・写真の出典</h1>
      <section className="ramen-section">
        <h2>写真から読み取れる4つの特徴</h2>
        <p>
          スープの透明感・見える麺の太さ・具の盛りの量感・盛り付けの整い方を比較します。4組の特徴を組み合わせた16タイプで、統計的に実証された性格診断ではありません。
        </p>
      </section>
      <section className="ramen-section">
        <h2>数字と境界の決め方</h2>
        <p>
          ○を100・△を50・×を0として、各特徴の両側で店ごとの平均点を計算し、それを店ごとに均等に平均します。△は中間評価として含め、読込不可は除きます。
        </p>
        <p>
          両側それぞれ6枚・3店以上が必要です。足りなければ「保留（材料不足）」、差が10ポイント未満なら「境界」です。1店ずつ除いて再計算し、方向が逆転・同点になる場合も境界とします。
        </p>
        <p>
          ○・△・×の少なくとも2種類に各10枚の回答があることを比較の目安とします。それ未満や、全て同じ回答の場合は、無理にタイプを決めません。
        </p>
        <p>
          麺が隠れている・中間的など、両側に分けられない写真は、その特徴だけ集計から除きます。スコアは診断の正確さや当たる確率ではありません。
        </p>
      </section>
      <section className="ramen-section">
        <h2>この結果で分かる範囲</h2>
        <p>
          完成済み100枚版と同じ100枚・58店、出題順、4軸・16タイプ、採点式を使っています。写真の特徴は目視で分類しているため誤差があり、照明・撮影方法・特徴の重なりの影響も含まれます。
        </p>
        <p>
          透明なスープからあっさり味、赤い色から辛さなどは断定しません。性格や味覚、他の写真への予測精度を測るものではありません。
        </p>
      </section>
      <details className="ramen-details">
        <summary>診断の設計で参照した資料</summary>
        <p>
          4組の選好から16タイプにする構造を参考にした独自の分類です。公式MBTIや16Personalitiesそのものではありません。
        </p>
        <ul>
          {profile.sources.map((s) => (
            <li key={s.url}>
              <SourceLink url={s.url}>{s.title}</SourceLink>
            </li>
          ))}
        </ul>
      </details>
      <details className="ramen-details">
        <summary>写真100枚の出典（来店者投稿）</summary>
        <p>
          完成済み診断に同梱された写真と出典を引き継いでいます。出典ページは外部ブラウザで開きます。
        </p>
        <ol className="ramen-source-list">
          {questions.map((q, index) => {
            const source = sources.find((s) => s.id === q.photo_id)
            return (
              <li key={q.id}>
                写真{index + 1}（{q.photo_id}） —{' '}
                {source ? (
                  <SourceLink url={source.source_url}>{source.credit || '掲載ページ'}</SourceLink>
                ) : (
                  '出典の確認が必要です'
                )}
              </li>
            )
          })}
        </ol>
      </details>
    </>
  )
}
export default function RamenDiagnosis() {
  const navigate = useNavigate()
  return (
    <div className="screen ramen-screen">
      <Header
        title="ラーメンタイプ診断"
        back
        right={
          <IconButton icon={House} label="ホームに戻る" onClick={() => navigate('/discover')} />
        }
      />
      <div className="page-pad ramen-content">
        <Routes>
          <Route index element={<Intro />} />
          <Route path="question/:index" element={<Question />} />
          <Route path="review" element={<Review />} />
          <Route path="result" element={<Result />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<Navigate to="/ramen" replace />} />
        </Routes>
      </div>
    </div>
  )
}
