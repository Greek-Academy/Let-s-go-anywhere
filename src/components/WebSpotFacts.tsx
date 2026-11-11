import { Star, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WebSpot } from '../domain/webSearch'
import { DriveTravelInfo } from './DriveTravelInfo'
import { decodePlaceRating } from '../domain/placeRating'

export function WebSpotFacts({ spot, compact = false }: { spot: WebSpot; compact?: boolean }) {
  const [, refresh] = useState(0)
  const rating = decodePlaceRating(spot.googleRating)
  useEffect(() => {
    if (!spot.googleRating) return
    const timer = setTimeout(
      () => refresh((n) => n + 1),
      Math.max(0, Date.parse(spot.googleRating.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [spot.googleRating])
  return (
    <div className="web-spot-facts">
      {rating && (
        <div className="google-place-rating">
          <a
            href={rating.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            aria-label={`${spot.name}のGoogle Mapsの評価：5点中${rating.rating.toFixed(1)}、口コミ${rating.count.toLocaleString('ja-JP')}件（別タブで開く）`}
          >
            <span className="google-rating-value">
              <Star size={15} fill="currentColor" aria-hidden="true" />
              {rating.rating.toFixed(1)}
            </span>
            <span className="google-rating-count">
              （{rating.count.toLocaleString('ja-JP')}件）
            </span>
            <span className="drive-maps-attribution" translate="no">
              Google Maps
            </span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          {rating.attributions.map((a) => (
            <a
              className="google-rating-provider"
              key={`${a.name}:${a.url}`}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {a.name}
            </a>
          ))}
        </div>
      )}
      <DriveTravelInfo travel={spot.travel} compact={compact} showAttribution={!rating} />
    </div>
  )
}
