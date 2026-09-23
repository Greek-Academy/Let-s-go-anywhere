import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { useContentTime } from '../content/ContentProvider'
import type { Outing } from '../data/types'
import { evaluateOuting, outingStateLabels } from '../domain/outingLifecycle'
import { Tag } from './ui'

export function OutingPhotoCredit({ outing }: { outing: Outing }) {
  const status = evaluateOuting(outing, useContentTime())
  return status.photoVisible && outing.imageCredit ? (
    <small className="outing-photo-credit">{outing.imageCredit}</small>
  ) : null
}

export function OutingImage({
  outing,
  className = '',
  decorative = false,
}: {
  outing: Outing
  className?: string
  decorative?: boolean
}) {
  const now = useContentTime()
  const [failed, setFailed] = useState<string | null>(null)
  if (evaluateOuting(outing, now).photoVisible && failed !== outing.image)
    return (
      <img
        className={className}
        src={outing.image}
        alt={decorative ? '' : (outing.imageAlt ?? `${outing.title}のイメージ`)}
        loading="lazy"
        onError={() => setFailed(outing.image)}
      />
    )
  return (
    <span
      className={`outing-photo-empty ${className}`}
      role="img"
      aria-label="写真は表示していません"
    >
      <ImageOff size={24} strokeWidth={1.4} aria-hidden="true" />
      <span aria-hidden="true">写真は表示していません</span>
    </span>
  )
}

export function OutingStatus({ outing, detail = false }: { outing: Outing; detail?: boolean }) {
  const result = evaluateOuting(outing, useContentTime())
  return (
    <span className={`outing-status ${detail ? 'outing-status-detail' : ''}`}>
      <Tag tone={result.recommendable ? 'mint' : 'peach'}>
        {outingStateLabels[result.state]}（サンプル）
      </Tag>
      {detail &&
        result.reasons.map((reason) => (
          <span className="outing-status-reason" key={reason}>
            {reason}
          </span>
        ))}
    </span>
  )
}
