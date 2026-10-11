import { useEffect, useId, useRef, useState } from 'react'
import { Check, Search, TrainFront, X } from 'lucide-react'
import { findRailStations, railStation, stationLabel } from '../domain/railStations'

/** A selection is an ID from the catalog, never arbitrary text or a guessed station. */
export function StationPicker({
  value,
  onChange,
  label = '駅名を入力',
}: {
  value: string | null | undefined
  onChange: (id: string | null) => void
  label?: string
}) {
  const id = useId()
  const selected = railStation(value)
  const [text, setText] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const container = useRef<HTMLDivElement>(null)
  const results = findRailStations(text)
  const hasResults = results.length > 0
  useEffect(() => {
    if (!open) return
    const reveal = () => {
      const picker = container.current
      const first = picker?.querySelector('[role="option"]')
      if (!picker?.contains(document.activeElement) || !first) return
      const viewport = window.visualViewport
      const scrollArea = picker.closest('.overlay-content, #app-scroll')?.getBoundingClientRect()
      const bottom = Math.min(
        viewport ? viewport.height + viewport.offsetTop : window.innerHeight,
        scrollArea?.bottom ?? Infinity,
      )
      if (first.getBoundingClientRect().bottom > bottom - 12)
        picker.scrollIntoView({ block: 'start', inline: 'nearest' })
    }
    const frame = requestAnimationFrame(reveal)
    // The native keyboard shrinks WKWebView after focus; keep suggestions above it.
    window.visualViewport?.addEventListener('resize', reveal)
    window.addEventListener('resize', reveal)
    return () => {
      cancelAnimationFrame(frame)
      window.visualViewport?.removeEventListener('resize', reveal)
      window.removeEventListener('resize', reveal)
    }
  }, [open, hasResults])
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, id])
  const choose = (stationId: string) => {
    const next = railStation(stationId)!
    setText(next.name)
    setOpen(false)
    setActive(-1)
    onChange(stationId)
  }
  return (
    <div className="station-picker" ref={container}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          placeholder="例：新宿、しんじゅく"
          value={text}
          maxLength={80}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(-1)
            onChange(null)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setActive((i) => {
                if (!results.length) return -1
                if (i < 0) return e.key === 'ArrowDown' ? 0 : results.length - 1
                return (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
              })
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (open && active >= 0 && results[active]) choose(results[active].id)
            } else if (e.key === 'Escape' && open) {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              setActive(-1)
            }
          }}
        />
        {!!text && (
          <button
            type="button"
            className="station-clear"
            aria-label={`${label}をクリア`}
            onClick={() => {
              setText('')
              setOpen(true)
              setActive(-1)
              onChange(null)
              document.getElementById(id)?.focus()
            }}
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      {selected && !open && (
        <p className="station-selected">
          <Check size={16} />
          {stationLabel(selected)}
        </p>
      )}
      {open && results.length > 0 && (
        <ul className="station-options" id={`${id}-list`} role="listbox" aria-label="駅の候補">
          {results.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={value === s.id}
              className={active === i ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s.id)}
            >
              <TrainFront size={19} aria-hidden="true" />
              <span>
                <strong>{stationLabel(s)}</strong>
                <small>
                  {s.kana} · {s.lines.join('・')}
                </small>
              </span>
              {value === s.id && <Check size={17} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
      <p className="small muted" role="status">
        {open && text.trim()
          ? results.length
            ? '候補から駅を選んでください。多い場合は続きを入力できます。'
            : '駅が見つかりません。漢字や読み方を変えてみてください。'
          : '漢字・ひらがな・カタカナで探せます。'}
      </p>
      <details className="station-credit small muted">
        <summary>駅データについて</summary>
        <p>
          駅名・読み・路線・代表位置：Seo-4d696b75 /
          station_database（2026年9月30日版）。廃止駅を除外し、検索用に加工しています。最新の営業情報や乗換案内を保証するものではありません。
        </p>
        <a href="https://github.com/Seo-4d696b75/station_database" target="_blank" rel="noreferrer">
          データの出典
        </a>
        {' · '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
      </details>
    </div>
  )
}
