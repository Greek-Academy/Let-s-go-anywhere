import { useState } from 'react'
import { CalendarDays, CameraOff, Heart, MapPin } from 'lucide-react'
import type { Draft } from './model'
import { validTimestamp } from './model'

export function PreviewCard({ draft, photoUrl }: { draft: Draft; photoUrl: string }) {
  const [failedUrl, setFailedUrl] = useState('')
  const visiblePhoto = photoUrl && photoUrl !== failedUrl
  const date =
    draft.kind === 'spot'
      ? '常設スポット'
      : validTimestamp(draft.startsAt)
        ? new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(draft.startsAt))
        : '開催日時を確認中'
  return (
    <section className="review-preview" aria-label="カードプレビュー">
      <div className="preview-heading">
        <span>APP PREVIEW</span>
        <p>スマホでの見え方</p>
      </div>
      <div className="preview-phone">
        <div className="preview-brand">
          Drive+ <small>掲載前の表示確認</small>
        </div>
        <article className="event-card">
          <div className="preview-photo">
            {visiblePhoto ? (
              <img
                className="event-photo"
                src={photoUrl}
                alt={draft.photo.alt}
                onError={() => setFailedUrl(photoUrl)}
              />
            ) : (
              <div className="review-photo-empty">
                <CameraOff size={32} />
                <span>
                  {photoUrl && photoUrl === failedUrl
                    ? '写真を読み込めませんでした'
                    : '写真は表示していません'}
                </span>
                <small>
                  {draft.photo.enabled
                    ? '利用条件と選択したファイルを確認してください'
                    : '写真なしのカードとして確認できます'}
                </small>
              </div>
            )}
            <span className="preview-heart" aria-hidden="true">
              <Heart size={20} />
            </span>
          </div>
          <div className="event-card-body">
            <span className="review-tag">
              {draft.kind === 'event' ? 'イベント' : '常設スポット'}
            </span>
            <h3>{draft.title || 'お出かけの名称'}</h3>
            <p className="event-subtitle">{draft.summary || '短い紹介文がここに入ります。'}</p>
            <div className="preview-meta">
              <p>
                <MapPin size={13} />
                {draft.area || '場所を確認中'}
              </p>
              <p>
                <CalendarDays size={13} />
                {date}
              </p>
            </div>
            <div className="preview-tags">
              {draft.tags.filter(Boolean).map((tag, i) => (
                <span className="review-tag" key={i}>
                  {tag}
                </span>
              ))}
            </div>
            {visiblePhoto && <small className="preview-credit">{draft.photo.credit}</small>}
          </div>
        </article>
        <p className="preview-description">{draft.description || '説明文がここに入ります。'}</p>
        <p className="review-hint">
          入力に基づく表示例です。情報の真偽・掲載許諾・公開承認を判定する画面ではありません。
        </p>
      </div>
    </section>
  )
}
