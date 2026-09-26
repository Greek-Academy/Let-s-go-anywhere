import { OutingImage, OutingStatus, OutingPhotoCredit } from './OutingStatus'
import { useContentTime } from '../content/ContentProvider'
import { evaluateOuting } from '../domain/outingLifecycle'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  Heart,
  MapPin,
  MoreHorizontal,
} from 'lucide-react'
import type { LearningContent, Outing, School, Station } from '../data/types'
import { useApp } from '../state/AppState'
import { IconButton, Tag } from './ui'

export function EventCard({
  outing,
  compact = false,
  onMore,
}: {
  outing: Outing
  compact?: boolean
  onMore?: () => void
}) {
  const { state, toggleEvent } = useApp()
  const navigate = useNavigate()
  const saved = state.savedEvents.includes(outing.id)
  const status = evaluateOuting(outing, useContentTime())
  return (
    <article className={`event-card ${compact ? 'compact' : ''}`}>
      <button
        className="event-photo-button"
        data-focus-key={`event-photo:${outing.id}`}
        onClick={() => navigate(`/events/${outing.id}`)}
        aria-label={`${outing.title}の詳細を見る`}
      >
        <OutingImage outing={outing} className="event-photo" />
        <span className="photo-gradient" />
        <span className="photo-category">
          {outing.kind === 'event' ? '季節の楽しみ' : '常設スポット'}
        </span>
        {!compact && <span className="photo-mood">{outing.mood}</span>}
      </button>
      <button
        className={`save-heart ${saved ? 'saved' : ''}`}
        onClick={() => toggleEvent(outing.id)}
        aria-label={`${outing.title}を${saved ? '保存解除' : '保存'}`}
        aria-pressed={saved}
      >
        <Heart size={20} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.8} />
      </button>
      <div className="event-card-body">
        <OutingPhotoCredit outing={outing} />
        <button
          className="card-title-button"
          data-focus-key={`event-title:${outing.id}`}
          onClick={() => navigate(`/events/${outing.id}`)}
        >
          <h3>{outing.title}</h3>
        </button>
        <p className="event-subtitle">{outing.subtitle}</p>
        <div className="event-meta">
          <span>
            <MapPin size={12} />
            {outing.area}
          </span>
          <span>
            <CalendarDays size={12} />
            {status.dateLabel}
          </span>
        </div>
        <OutingStatus outing={outing} />
        <div className="card-bottom">
          <div className="tags">
            {outing.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
          <div className="card-actions">
            <span className="source-label">{outing.source}から</span>
            {onMore && (
              <IconButton
                icon={MoreHorizontal}
                label={`${outing.title}のおすすめ理由`}
                onClick={onMore}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
export function CarIllustration({ blue = false }: { blue?: boolean }) {
  return (
    <svg
      className="car-illustration"
      viewBox="0 0 270 140"
      role="img"
      aria-label="車両のイメージイラスト"
    >
      <ellipse cx="135" cy="121" rx="109" ry="5" fill="#d4e2dc" />
      <path
        d="M30 92 62 84 87 53h82l34 34 29 13 4 20H26Z"
        fill={blue ? '#e0ebf1' : '#e1ede6'}
        stroke={blue ? '#6798b1' : '#6b9690'}
        strokeWidth="2"
      />
      <path d="m93 60-22 27h55V60Zm43 0v27h57l-28-27Z" fill={blue ? '#91b9cc' : '#8cb6b2'} />
      <path d="M26 101h15m185 1h9" stroke="#e9c790" strokeWidth="5" />
      <circle cx="76" cy="117" r="18" fill="#24413f" />
      <circle cx="76" cy="117" r="9" fill="#b8ccca" />
      <circle cx="197" cy="117" r="18" fill="#24413f" />
      <circle cx="197" cy="117" r="9" fill="#b8ccca" />
      <path d="M137 93h10" stroke="#6b9690" strokeWidth="2" />
    </svg>
  )
}
export function StationCard({
  station,
  onClick,
  savedAction = false,
}: {
  station: Station
  onClick: () => void
  savedAction?: boolean
}) {
  const { state, toggleStation } = useApp()
  return (
    <article className="station-card">
      <button
        className="station-card-main"
        data-focus-key={`station:${station.id}`}
        onClick={onClick}
      >
        <span className={`station-avatar ${station.type === 'レンタカー' ? 'blue' : ''}`}>
          <CarFront size={26} strokeWidth={1.6} />
        </span>
        <span className="station-card-copy">
          <Tag tone={station.type === 'レンタカー' ? 'blue' : 'mint'}>{station.type}</Tag>
          <strong>{station.name}</strong>
          <small>{station.area}駅周辺 · サンプル拠点</small>
          <span className="station-availability">空き状況は公式で確認</span>
        </span>
        <ChevronRight size={17} />
      </button>
      {savedAction && (
        <IconButton
          icon={Heart}
          label={`${station.name}を保存解除`}
          className={state.savedStations.includes(station.id) ? 'heart-active' : ''}
          onClick={() => toggleStation(station.id)}
        />
      )}
    </article>
  )
}
export function LessonCard({ lesson }: { lesson: LearningContent }) {
  const { state } = useApp()
  const navigate = useNavigate()
  const completed = state.learned.includes(lesson.id)
  return (
    <button
      className="lesson-card"
      data-focus-key={`lesson:${lesson.id}`}
      onClick={() => navigate(`/learn/${lesson.id}`)}
    >
      <div className="lesson-photo">
        <img src={lesson.image} alt="" loading="lazy" />
        {completed && (
          <span>
            <Check size={13} />
          </span>
        )}
      </div>
      <div className="lesson-card-copy">
        <Tag>{lesson.category}</Tag>
        <h3>{lesson.title}</h3>
        <p>
          {lesson.time}分 · 読んで学ぶ{completed ? ' · 学習済み' : ''}
        </p>
      </div>
      <ChevronRight size={17} />
    </button>
  )
}
export function SchoolCard({ school }: { school: School }) {
  const navigate = useNavigate()
  return (
    <article className="school-card">
      <div className="school-card-top">
        <div className={`school-art ${school.color}`}>
          <CarFront size={31} strokeWidth={1.3} />
          <span>{school.initial}</span>
        </div>
        <div>
          <Tag tone="neutral">サンプルの講習会社</Tag>
          <h3>{school.name}</h3>
          <p>
            <MapPin size={12} />
            {school.area.join('・')} · 出張対応
          </p>
        </div>
      </div>
      <p className="school-feature">{school.feature}</p>
      <div className="tags">
        {school.practices.map((p) => (
          <Tag key={p}>{p}</Tag>
        ))}
        <Tag tone="neutral">{school.vehicles.join(' / ')}</Tag>
      </div>
      <div className="school-card-bottom">
        <p>
          <strong>¥{school.price.toLocaleString()}</strong>
          <small> / {school.duration}〜（例）</small>
        </p>
        <button
          data-focus-key={`school:${school.id}`}
          onClick={() => navigate(`/schools/${school.id}`)}
        >
          詳細を見る
          <ArrowUpRight size={15} />
        </button>
      </div>
    </article>
  )
}
