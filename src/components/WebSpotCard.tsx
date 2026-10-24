import { DriveTravelInfo } from './DriveTravelInfo'
import { providerNames } from '../domain/recommendations'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, ExternalLink } from 'lucide-react'
import { SpotIllustration } from './SpotIllustration'
import { spotIllustrationKind } from '../data/spotIllustrations'
import type { WebSpot } from '../domain/webSearch'
import { sameWebSpot } from '../domain/webSearch'
import { useApp } from '../state/AppState'
import { useWebSearch } from '../state/WebSearchState'
import { ExternalModal } from './ExternalLinkModal'
import { Tag } from './ui'

export function WebSpotImage({
  spot,
  className = '',
  compact = false,
  eager = false,
}: {
  spot: WebSpot
  className?: string
  compact?: boolean
  eager?: boolean
}) {
  return (
    <SpotIllustration
      kind={spotIllustrationKind(spot)}
      className={`web-spot-image ${className}`}
      compact={compact}
      eager={eager}
    />
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
  const [url, setUrl] = useState<string | null>(null)
  const sources = spot.recommendations ?? [{ provider: null, sourceUrl: spot.sourceUrl }]
  return (
    <>
      {sources.map((source) => (
        <button
          key={source.provider ?? 'legacy'}
          className="text-button web-source"
          onClick={() => setUrl(source.sourceUrl)}
          aria-label={`${spot.name}の${source.provider ? providerNames[source.provider] + 'の' : ''}出典を確認`}
        >
          <ExternalLink size={14} aria-hidden="true" />
          {source.provider ? providerNames[source.provider] + 'の' : ''}出典：
          {new URL(source.sourceUrl).hostname}
        </button>
      ))}
      {url && (
        <ExternalModal
          title={spot.name}
          request={{ type: 'research', url, comparison: Boolean(spot.recommendations) }}
          onClose={() => setUrl(null)}
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
  const saved = state.savedWebSpots.some((s) => sameWebSpot(s, spot))
  return (
    <article className="event-card web-spot-card">
      <button
        className="event-photo-button"
        data-focus-key={`web-spot:${spot.id}`}
        aria-label={`${spot.name}の詳細を見る`}
        onClick={() => navigate(`/web-spots/${spot.id}`)}
      >
        <WebSpotImage spot={spot} className="event-photo" />
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
        <button className="card-title-button" onClick={() => navigate(`/web-spots/${spot.id}`)}>
          <h3>{spot.name}</h3>
          <DriveTravelInfo travel={spot.travel} compact />
        </button>
      </div>
    </article>
  )
}
