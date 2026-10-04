import type { WebSpot } from '../domain/webSearch'
import { providerNames } from '../domain/recommendations'
import { useApp } from '../state/AppState'
import { Chip, Tag } from './ui'

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
export function RecommendationFeedback({ spot }: { spot: WebSpot }) {
  const { state, update, storageProtected } = useApp()
  const saved = state.savedWebSpots.find((s) => s.id === spot.id)
  const availableTags = saved?.tags ?? spot.tags ?? []
  if (!spot.recommendations || !availableTags.length) return null
  const selected = saved?.likedFor ?? saved?.tags ?? []
  const change = (next: string[]) =>
    update((s) => ({
      ...s,
      savedWebSpots: s.savedWebSpots.map((item) =>
        item.id === spot.id ? { ...item, likedFor: next } : item,
      ),
    }))
  return (
    <div className="recommendation-feedback">
      <p className="small muted">
        {saved ? '好きなところを選べます（任意）' : 'AIが整理した特徴・未確認'}
      </p>
      <div className="chips wrap">
        {availableTags.map((tag) =>
          saved ? (
            <Chip
              key={tag}
              selected={selected.includes(tag)}
              disabled={storageProtected}
              onClick={() =>
                change(
                  selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag],
                )
              }
            >
              {tag}
            </Chip>
          ) : (
            <Tag key={tag} tone="neutral">
              {tag}
            </Tag>
          ),
        )}
      </div>
      {saved && (
        <button
          className="text-button small"
          disabled={storageProtected || !selected.length}
          onClick={() => change([])}
        >
          このいいねを好み順に使わない
        </button>
      )}
    </div>
  )
}
