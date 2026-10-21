import type { WebSpot } from '../domain/webSearch'
import { providerNames } from '../domain/recommendations'
import { Tag } from './ui'

export function RecommendationBadges({ spot }: { spot: WebSpot }) {
  if (!spot.recommendations) return null
  return (
    <div className="recommendation-badges" aria-label="提案元">
      {spot.recommendations.map((r) => (
        <Tag key={r.provider} tone={r.provider === 'openai' ? 'mint' : 'peach'}>
          {providerNames[r.provider]}の提案
        </Tag>
      ))}
    </div>
  )
}
export function RecommendationFeatures({ spot }: { spot: WebSpot }) {
  const tags = spot.tags ?? []
  if (!spot.recommendations || !tags.length) return null
  return (
    <div className="recommendation-feedback">
      <p className="small muted">AIが整理した特徴・未確認</p>
      <div className="chips wrap">
        {tags.map((tag) => (
          <Tag key={tag} tone="neutral">
            {tag}
          </Tag>
        ))}
      </div>
    </div>
  )
}
