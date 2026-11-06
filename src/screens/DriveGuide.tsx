import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Sparkles, X } from 'lucide-react'
import { Brand } from '../components/ui'
import { driveGuidePages } from '../data/driveGuide'
import { useApp } from '../state/AppState'
import './driveGuide.css'

const count = driveGuidePages.length
const number = (index: number) => String(index + 1).padStart(2, '0')

/** One story for both the first-run introduction and the optional home guide. */
export function DriveGuide({ introductory = false }: { introductory?: boolean }) {
  const { state } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const initial =
    introductory && Number.isInteger(location.state?.guidePage)
      ? Math.max(0, Math.min(count - 1, location.state.guidePage as number))
      : 0
  const [page, setPage] = useState(initial)
  const pageRef = useRef(initial)
  const requestedPage = useRef<number | null>(null)
  const carousel = useRef<HTMLDivElement>(null)
  const close = () => {
    if (location.state?.fromDiscover && window.history.state?.idx > 0) navigate(-1)
    else navigate('/discover', { replace: true })
  }
  const go = useCallback(
    (index: number, smooth = true) => {
      const element = carousel.current
      if (!element) return
      const next = Math.max(0, Math.min(count - 1, index))
      const animate =
        smooth &&
        !state.settings.reducedMotion &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      pageRef.current = next
      requestedPage.current = animate ? next : null
      setPage(next)
      element.scrollTo({
        left: element.clientWidth * next,
        behavior: animate ? 'smooth' : 'instant',
      })
    },
    [state.settings.reducedMotion],
  )

  useLayoutEffect(() => {
    const element = carousel.current
    if (!element) return
    let width = element.clientWidth
    let frame = 0
    go(pageRef.current, false)
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!element.clientWidth || element.clientWidth !== width) return
        if (
          requestedPage.current !== null &&
          Math.abs(element.scrollLeft - requestedPage.current * width) > 2
        )
          return
        requestedPage.current = null
        const next = Math.max(0, Math.min(count - 1, Math.round(element.scrollLeft / width)))
        pageRef.current = next
        setPage(next)
      })
    }
    const interrupt = () => {
      requestedPage.current = null
    }
    const observer = new ResizeObserver(() => {
      if (!element.clientWidth || element.clientWidth === width) return
      width = element.clientWidth
      cancelAnimationFrame(frame)
      go(pageRef.current, false)
    })
    observer.observe(element)
    element.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('pointerdown', interrupt, { passive: true })
    element.addEventListener('touchstart', interrupt, { passive: true })
    element.addEventListener('wheel', interrupt, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('pointerdown', interrupt)
      element.removeEventListener('touchstart', interrupt)
      element.removeEventListener('wheel', interrupt)
    }
  }, [go])

  return (
    <section
      className="drive-guide"
      aria-labelledby="drive-guide-heading"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !introductory) {
          event.preventDefault()
          close()
          return
        }
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        go(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : pageRef.current + (event.key === 'ArrowRight' ? 1 : -1),
        )
      }}
    >
      <h1 className="sr-only" id="drive-guide-heading">
        Drive+の使い方
      </h1>
      <header className="guide-header">
        <Brand small />
        <span>漫画でわかる使い方</span>
        {!introductory && (
          <button className="guide-close" aria-label="使い方を閉じる" onClick={close}>
            <X size={20} />
          </button>
        )}
      </header>
      <div
        ref={carousel}
        className="guide-carousel"
        tabIndex={0}
        role="region"
        aria-roledescription="カルーセル"
        aria-label="Drive+の使い方。左右にスワイプ、または矢印キーでページを移動"
      >
        {driveGuidePages.map((item, index) => (
          <article
            className="guide-page"
            key={item.label}
            role="group"
            aria-roledescription="スライド"
            aria-label={`${index + 1} / ${count}：${item.label}`}
            aria-hidden={page !== index}
          >
            <p className="guide-kicker">
              <span>{number(index)}</span>
              {item.kicker}
            </p>
            <h2>{item.title}</h2>
            <div className="guide-comic">
              <div
                className={`guide-art guide-scene-${index + 1}`}
                role="img"
                aria-label={item.alt}
              />
              <div className="guide-speech">{item.speech}</div>
            </div>
            <p className="guide-caption">{item.caption}</p>
            {item.chips && (
              <div className="guide-chips">
                {item.chips.map(({ icon: Icon, label }) => (
                  <span key={label}>
                    {Icon && <Icon size={14} aria-hidden="true" />}
                    {label}
                  </span>
                ))}
              </div>
            )}
            {item.query && (
              <p className="guide-query">
                <Sparkles size={16} aria-hidden="true" />
                {item.query}
              </p>
            )}
            {item.note && <p className="guide-footnote">{item.note}</p>}
          </article>
        ))}
      </div>
      <footer className="guide-footer">
        <div className="guide-progress">
          <div className="guide-dots" aria-label="ページを選択">
            {driveGuidePages.map((item, index) => (
              <button
                key={item.label}
                aria-label={`${index + 1}ページ目：${item.label}`}
                aria-current={page === index ? 'step' : undefined}
                onClick={() => go(index)}
              />
            ))}
          </div>
          <span className="guide-counter" aria-hidden="true">
            <b>{number(page)}</b> / {number(count - 1)}
          </span>
        </div>
        <div className="guide-navigation">
          <button
            className="guide-back"
            aria-label="前のページ"
            disabled={page === 0}
            onClick={() => go(pageRef.current - 1)}
          >
            <ArrowLeft size={19} />
          </button>
          <button
            className="guide-next"
            onClick={() => {
              if (pageRef.current < count - 1) go(pageRef.current + 1)
              else if (introductory) navigate('/onboarding/1', { state: { fromGuide: true } })
              else close()
            }}
          >
            <span>
              {page === count - 1
                ? introductory
                  ? 'さっそく、趣味を選ぶ'
                  : 'ホームへ戻る'
                : '次へ'}
            </span>
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="guide-hint">左右にスワイプして読めます</p>
      </footer>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {page + 1} / {count}。{driveGuidePages[page].label}
      </p>
    </section>
  )
}

export function DriveGuideEntry() {
  const navigate = useNavigate()
  return (
    <section className="drive-guide-entry" aria-labelledby="drive-guide-entry-heading">
      <BookOpen className="guide-entry-icon" size={31} aria-hidden="true" />
      <p className="guide-entry-eyebrow">HOW TO DRIVE+</p>
      <h2 id="drive-guide-entry-heading">行き先探しに、迷ったら。</h2>
      <p>
        気分に合うドライブの見つけ方を、
        <br />
        漫画でさくっとおさらい。
      </p>
      <button
        data-focus-key="discover-guide"
        onClick={() => navigate('/guide', { state: { fromDiscover: true } })}
      >
        このアプリの使い方
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </section>
  )
}
