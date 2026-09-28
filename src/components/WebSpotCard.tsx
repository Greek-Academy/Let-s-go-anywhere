import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, ImageOff, MapPin, ExternalLink } from 'lucide-react'
import type { WebSpot } from '../domain/webSearch'
import { useApp } from '../state/AppState'
import { useWebSearch } from '../state/WebSearchState'
import { ExternalModal } from './ExternalLinkModal'
import { Tag } from './ui'

export function WebSpotImage({ className = '' }: { className?: string }) {
  return (
    <span
      className={`outing-photo-empty web-spot-image ${className}`}
      role="img"
      aria-label="写真は未取得です"
    >
      <ImageOff size={24} aria-hidden="true" />
      <span aria-hidden="true">写真は未取得です</span>
    </span>
  )
}
export function WebSpotStatus({ spot }: { spot: WebSpot }) {
  return (
    <Tag tone={spot.mode === 'sample' ? 'peach' : 'mint'}>
      {spot.mode === 'sample' ? '架空の検索サンプル' : 'Web検索・内容未確認'}
    </Tag>
  )
}
export function WebSpotSource({ spot }: { spot: WebSpot }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="text-button web-source"
        onClick={() => setOpen(true)}
        aria-label={`${spot.name}の出典を確認`}
      >
        <ExternalLink size={14} aria-hidden="true" />
        出典：{new URL(spot.sourceUrl).hostname}
      </button>
      {open && (
        <ExternalModal
          title={spot.name}
          request={{ type: 'research', url: spot.sourceUrl }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
export function searchDate(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
export function WebSpotCard({ spot }: { spot: WebSpot }) {
  const navigate = useNavigate()
  const { state, storageProtected } = useApp()
  const { toggleSaved } = useWebSearch()
  const saved = state.savedWebSpots.some((s) => s.id === spot.id)
  return (
    <article className="event-card web-spot-card">
      <button
        className="event-photo-button"
        data-focus-key={`web-spot:${spot.id}`}
        aria-label={`${spot.name}の詳細を見る`}
        onClick={() => navigate(`/web-spots/${spot.id}`)}
      >
        <WebSpotImage className="event-photo" />
        <span className="photo-category">常設スポットの候補</span>
      </button>
      <button
        className={`save-heart ${saved ? 'saved' : ''}`}
        disabled={storageProtected}
        aria-label={`${spot.name}を${saved ? '保存解除' : '保存'}`}
        aria-pressed={saved}
        onClick={() => toggleSaved(spot)}
      >
        <Heart size={20} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.8} />
      </button>
      <div className="event-card-body">
        <WebSpotStatus spot={spot} />
        <button className="card-title-button" onClick={() => navigate(`/web-spots/${spot.id}`)}>
          <h3>{spot.name}</h3>
        </button>
        <p className="event-subtitle">{spot.summary}</p>
        <div className="event-meta">
          <span>
            <MapPin size={12} />
            {spot.area}
          </span>
        </div>
        <WebSpotSource spot={spot} />
        <p className="small muted">
          検索：{searchDate(spot.retrievedAt)}
          <br />
          営業状況・料金・駐車場：未確認
        </p>
      </div>
    </article>
  )
}
