import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Expand, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import { Modal, PrimaryButton } from '../components/ui'
import { useApp } from '../state/AppState'
import { isNativeApp } from '../platform/runtime'
import type { Comparison } from './model'
import './ramen.css'

export function RamenLaunchCard() {
  const navigate = useNavigate()
  const { state } = useApp()
  const count = Object.keys(state.ramen.answers).length
  return (
    <button
      className="ramen-launch"
      data-focus-key="ramen-launch"
      onClick={() => navigate('/ramen')}
    >
      <img src={`${import.meta.env.BASE_URL}images/ramen/p077.jpg`} alt="" width="72" height="72" />
      <span>
        <small>写真から見つける、あなたの一杯</small>
        <strong>ラーメンタイプ診断</strong>
        <span>
          {count === 100
            ? '診断結果を見る'
            : count
              ? `${count} / 100枚 回答済み・続きから`
              : '100枚の写真 × 16タイプ・途中保存OK'}
        </span>
      </span>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  )
}

export function Bowl({ code = 'CFSA' }: { code?: string }) {
  const clear = code[0] === 'C',
    thick = code[1] === 'T',
    loaded = code[2] === 'L',
    arranged = code[3] === 'A'
  const positions = arranged
    ? [
        [46, 51],
        [72, 51],
        [98, 51],
        [124, 51],
      ]
    : [
        [49, 54],
        [81, 43],
        [108, 64],
        [130, 49],
      ]
  return (
    <svg className="ramen-bowl" viewBox="0 0 176 118" aria-hidden="true">
      <ellipse cx="88" cy="100" rx="51" ry="8" fill="#203f3810" />
      <path d="M18 51h140c-5 31-29 49-70 49S23 82 18 51" fill={clear ? '#b9dcd3' : '#80b3ad'} />
      <ellipse cx="88" cy="51" rx="70" ry="34" fill="#fff" />
      <ellipse cx="88" cy="51" rx="61" ry="27" fill={clear ? '#b7762d' : '#dfc3a0'} />
      <g stroke="#f9e8ac" strokeWidth={thick ? 5 : 2} fill="none" strokeLinecap="round">
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${46 + i * 9} 59q14-28 32 0t31-5`} />
        ))}
      </g>
      {positions.slice(0, loaded ? 4 : 1).map(([x, y]) => (
        <ellipse
          key={x}
          cx={x}
          cy={y}
          rx="14"
          ry="10"
          fill="#eab9a0"
          stroke="#ad7766"
          strokeWidth="2"
        />
      ))}
      <g fill="#54876d">
        <circle cx="85" cy="38" r="4" />
        <circle cx="92" cy="35" r="3" />
        <circle cx="91" cy="42" r="3" />
      </g>
    </svg>
  )
}

export function RamenPhoto({
  id,
  label,
  onStatus,
  small = false,
}: {
  id: string
  label: string
  onStatus?: (status: 'loading' | 'ready' | 'error') => void
  small?: boolean
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const src = `${import.meta.env.BASE_URL}images/ramen/${id}.jpg${attempt ? `?retry=${attempt}` : ''}`
  const settle = (value: typeof status) => {
    setStatus(value)
    onStatus?.(value)
  }
  return (
    <div className={`ramen-photo ${small ? 'ramen-photo-small' : ''}`}>
      <button
        type="button"
        className="ramen-photo-expand"
        aria-label={`${label}を拡大`}
        disabled={status !== 'ready'}
        onClick={() => setExpanded(true)}
      >
        {status !== 'error' && (
          <img
            key={src}
            src={src}
            alt={label}
            draggable={false}
            loading={small ? 'lazy' : 'eager'}
            onLoad={() => settle('ready')}
            onError={() => settle('error')}
          />
        )}
        {status === 'ready' && (
          <span className="ramen-zoom-hint">
            <Expand size={15} />
            {!small && '拡大して見る'}
          </span>
        )}
      </button>
      {status === 'loading' && (
        <p className="ramen-photo-status" role="status">
          写真を読み込み中…
        </p>
      )}
      {status === 'error' && (
        <div className="ramen-photo-error" role="alert">
          <p>写真を読み込めませんでした。</p>
          <PrimaryButton
            variant="secondary"
            icon={RotateCcw}
            onClick={() => {
              settle('loading')
              setAttempt((n) => n + 1)
            }}
          >
            写真を再読み込み
          </PrimaryButton>
        </div>
      )}
      {expanded && <PhotoZoom src={src} label={label} onClose={() => setExpanded(false)} />}
    </div>
  )
}

function PhotoZoom({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false)
  return (
    <Modal title={label} onClose={onClose}>
      <div
        className={`ramen-zoom-viewport ${zoomed ? 'ramen-zoomed' : ''}`}
        tabIndex={0}
        role="region"
        aria-label="写真の拡大・スクロール領域"
      >
        <img src={src} alt={`拡大した${label}`} draggable={false} />
      </div>
      <p className="ramen-zoom-help">拡大した写真は、指やスクロールで上下左右に動かせます。</p>
      <PrimaryButton variant="secondary" onClick={() => setZoomed((value) => !value)}>
        {zoomed ? '全体を表示' : '2倍に拡大'}
      </PrimaryButton>
    </Modal>
  )
}

export function AxisCard({ axis }: { axis: Comparison }) {
  const status =
    axis.status === 'insufficient'
      ? '保留（材料不足）'
      : axis.status === 'boundary'
        ? '境界'
        : `${axis.labels[axis.direction > 0 ? 1 : 0]}寄り`
  return (
    <article className="ramen-axis">
      <div className="ramen-axis-title">
        <h3>{axis.name}</h3>
        <span className={`ramen-status ramen-status-${axis.status}`}>{status}</span>
      </div>
      {[axis.minus, axis.plus].map((group, i) => (
        <div className="ramen-pole" key={axis.labels[i]}>
          <div>
            <strong>{axis.labels[i]}</strong>
            <b>{group.rate === null ? '—' : `${Math.round(group.rate * 100)}%`}</b>
          </div>
          {group.rate === null ? (
            <p className="ramen-muted">採点対象の回答なし</p>
          ) : (
            <div
              className="ramen-meter"
              role="meter"
              aria-label={`${axis.name}・${axis.labels[i]}の好みスコア`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(group.rate * 100)}
            >
              <span style={{ width: `${group.rate * 100}%` }} />
            </div>
          )}
          <p className="ramen-muted">
            ○ {group.yes}・△ {group.maybe}・× {group.no} ／ {group.n}枚・{group.restaurants}店
          </p>
        </div>
      ))}
      <p className="ramen-axis-delta">
        スコアの差：
        {axis.delta === null ? '比較できません' : `${Math.abs(axis.delta).toFixed(1)}ポイント`}
      </p>
      {axis.meaning && <p className="ramen-muted">{axis.meaning}</p>}
      <p className="ramen-muted">中間・判別不可など{axis.excluded}枚は、この特徴の比較から除外。</p>
    </article>
  )
}

export function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  const { toast } = useApp()
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      onClick={(event) => {
        if (isNativeApp) {
          event.preventDefault()
          void Browser.open({ url }).catch(() =>
            toast('出典を開けませんでした。時間をおいてもう一度お試しください。'),
          )
        }
      }}
    >
      {children} ↗
    </a>
  )
}
