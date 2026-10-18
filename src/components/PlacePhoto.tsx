import { useState } from 'react'
import { SpotIllustration } from './SpotIllustration'
import type { PlacePhoto as Photo } from '../domain/placePhoto'

/** Ephemeral API response: no persistence, prefetch, image download or photo URL cache. */
export function PlacePhoto({ photo, name }: { photo: Photo; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <>
        <SpotIllustration kind="cafe" className="event-photo" />
        <p className="photo-pilot-note">写真を読み込めなかったため、イラストを表示しています。</p>
      </>
    )
  return (
    <figure className="place-photo">
      <img
        className="event-photo"
        src={photo.imageUrl}
        alt={`${name}に登録された写真`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      <figcaption>
        <span className="google-maps-credit" translate="no">
          Google Maps
        </span>
        {photo.authors.map((author, index) => (
          <a
            key={`${author.url}-${index}`}
            href={author.url}
            target="_blank"
            rel="noopener noreferrer"
            className="photo-author"
          >
            {author.avatar && (
              <img
                src={author.avatar}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.hidden = true
                }}
              />
            )}
            {author.name}
          </a>
        ))}
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
          元の写真・問題の報告
        </a>
      </figcaption>
    </figure>
  )
}
