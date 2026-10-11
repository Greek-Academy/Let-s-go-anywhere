import { useState } from 'react'
import { Map } from 'lucide-react'
import { spotIllustrations } from '../data/spotIllustrations'
import type { SpotIllustrationKind } from '../data/spotIllustrations'

export function SpotIllustration({
  kind = 'outing',
  className = '',
  compact = false,
  eager = false,
}: {
  kind?: SpotIllustrationKind
  className?: string
  compact?: boolean
  eager?: boolean
}) {
  const [failed, setFailed] = useState<string[]>([])
  const artwork = spotIllustrations[kind]
  const file = failed.includes(artwork.file) ? spotIllustrations.outing.file : artwork.file
  const unavailable = failed.includes(file)
  const subject = unavailable || file !== artwork.file ? 'お出かけ' : artwork.label
  const label = `${subject}のイメージイラスト（実際の場所の写真ではありません）`
  return (
    <span
      className={`spot-illustration ${compact ? 'spot-illustration-compact' : ''} ${className}`}
      role="img"
      aria-label={label}
    >
      {unavailable ? (
        <Map
          className="spot-illustration-fallback"
          size={40}
          strokeWidth={1.3}
          aria-hidden="true"
        />
      ) : (
        <img
          src={`${import.meta.env.BASE_URL}images/spot-illustrations/${file}`}
          alt=""
          aria-hidden="true"
          width={960}
          height={640}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed((files) => (files.includes(file) ? files : [...files, file]))}
        />
      )}
      <span className="spot-illustration-caption" aria-hidden="true">
        イメージ
      </span>
    </span>
  )
}
