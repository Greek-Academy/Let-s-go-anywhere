import { ArrowRight, BookOpen, ChevronRight, Clock3, ExternalLink, Lightbulb } from 'lucide-react'
import { Browser } from '@capacitor/browser'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { columnGenres, getColumnGenre, learningColumns } from '../data/learningColumns'
import { Chip, EmptyState, Header, PrimaryButton, Tag, useBack } from '../components/ui'
import { isNativeApp } from '../platform/runtime'
import { useApp } from '../state/AppState'

export function LearningColumns() {
  const [params, setParams] = useSearchParams()
  const selected = getColumnGenre(params.get('genre'))
  const navigate = useNavigate()
  const columns = learningColumns.filter(
    (column) => selected === 'all' || column.genre === selected,
  )
  const genre = columnGenres.find((item) => item.id === selected)
  return (
    <section className="learning-columns" aria-labelledby="columns-heading">
      <div className="column-section-heading">
        <span className="column-section-icon">
          <Lightbulb size={23} strokeWidth={1.6} />
        </span>
        <div>
          <p className="eyebrow teal">知ると、準備が変わる</p>
          <h2 id="columns-heading">はじめての気づきコラム</h2>
        </div>
      </div>
      <p className="column-intro">
        「そこまで考えていなかった」を、ひとつずつ。
        <br />
        気になるお話から、読んでみませんか。
      </p>
      <div className="chips wrap column-genres" role="group" aria-label="コラムのジャンル">
        {[{ id: 'all', title: 'すべて' }, ...columnGenres].map((item) => (
          <Chip
            key={item.id}
            selected={item.id === selected}
            onClick={() => {
              const next = new URLSearchParams(params)
              if (item.id === 'all') next.delete('genre')
              else next.set('genre', item.id)
              setParams(next, { replace: true })
            }}
          >
            {item.title}
          </Chip>
        ))}
      </div>
      <div className="column-list-heading" aria-live="polite" aria-atomic="true">
        <span>{genre?.description ?? '今のあなたに、気になるお話を。'}</span>
        <strong>{columns.length}本</strong>
      </div>
      <div className="column-list">
        {columns.map((column) => (
          <button
            type="button"
            className="column-card"
            key={column.id}
            aria-label={`${column.title}を読む`}
            data-focus-key={`column:${column.id}`}
            onClick={() => navigate(`/learn/columns/${column.id}`)}
          >
            <img src={column.image} alt="" loading="lazy" />
            <span className="column-card-copy">
              <span className="column-card-genre">
                {columnGenres.find((item) => item.id === column.genre)?.title}
              </span>
              <strong>{column.title}</strong>
              <span className="column-card-summary">{column.summary}</span>
              <span className="column-card-footer">
                <BookOpen size={12} /> 読んで気づく <ChevronRight size={15} />
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="column-pilot-note">まずは6本から。試作・未監修のコラムです。</p>
    </section>
  )
}

export function LearningColumnDetail() {
  const { id } = useParams()
  const column = learningColumns.find((item) => item.id === id)
  const navigate = useNavigate()
  const { toast } = useApp()
  const genre = columnGenres.find((item) => item.id === column?.genre)
  const listUrl = genre ? `/learn?genre=${genre.id}` : '/learn'
  const goBack = useBack(listUrl)
  if (!column || !genre)
    return (
      <div className="screen">
        <Header back={goBack} title="気づきコラム" />
        <EmptyState
          title="コラムが見つかりません"
          description="学ぶタブから、別のお話を選べます。"
          action="コラム一覧へ"
          onAction={() => navigate('/learn', { replace: true })}
        />
      </div>
    )
  return (
    <div className="screen column-detail-screen">
      <Header back={goBack} title="気づきコラム" />
      <article className="page-pad column-article">
        <div className="tags">
          <Tag>{genre.title}</Tag>
          <Tag tone="neutral">試作・未監修</Tag>
        </div>
        <h1>{column.title}</h1>
        <p className="column-deck">{column.summary}</p>
        <img className="column-hero" src={column.image} alt="" />
        <p className="column-photo-note">写真はイメージです</p>
        <div className="column-scene">
          <span className="eyebrow teal">こんな場面、ありませんか？</span>
          <p>{column.scene}</p>
        </div>
        <aside className="column-takeaway">
          <Lightbulb size={22} />
          <div>
            <strong>最初に、これだけ</strong>
            <p>{column.takeaway}</p>
          </div>
        </aside>
        {column.sections.map((section, index) => (
          <section className="column-body-section" key={section.title}>
            <span className="column-point" aria-hidden="true">
              POINT 0{index + 1}
            </span>
            <h2>{section.title}</h2>
            {section.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </section>
        ))}
        <section className="column-preparation">
          <h2>
            <Clock3 size={18} /> 次のお出かけ前に
          </h2>
          <ol>
            {column.preparation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
        <section className="column-reflection">
          <p className="eyebrow teal">自分のこととして考えてみる</p>
          <h2>{column.reflection}</h2>
          <p>答えはひとつではありません。気になることは、講師に相談するときのヒントにも。</p>
        </section>
        <div className="column-references">
          <h2>このコラムについて</h2>
          <p>
            提供された「知らなかったことの一覧」をもとに編集した試作です。専門家の監修は未実施で、実技の評価や運転の可否の判定には使いません。
          </p>
          {column.references.length > 0 ? (
            <>
              <h3>確認に使った参考資料</h3>
              {column.references.map((reference) => (
                <div key={reference.url} className="column-reference">
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    onClick={(event) => {
                      if (!isNativeApp) return
                      event.preventDefault()
                      void Browser.open({ url: reference.url }).catch(() =>
                        toast('参考資料を開けませんでした。時間をおいてお試しください。'),
                      )
                    }}
                  >
                    {reference.title}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                  <p>{reference.scope}</p>
                </div>
              ))}
              <p>
                参考資料は外部ブラウザで開きます。本文全体への監修・承認を示すものではありません。
              </p>
            </>
          ) : (
            <p>会話例と準備の提案です。特定の効果や、相手の気持ちを保証するものではありません。</p>
          )}
          <p>編集日：2026年10月1日</p>
        </div>
        <PrimaryButton icon={ArrowRight} onClick={goBack}>
          コラム一覧へ戻る
        </PrimaryButton>
      </article>
    </div>
  )
}
