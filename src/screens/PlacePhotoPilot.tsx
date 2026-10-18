import { useEffect, useState } from 'react'
import { Header, PrimaryButton } from '../components/ui'
import { SpotIllustration } from '../components/SpotIllustration'
import { PlacePhoto } from '../components/PlacePhoto'
import { decodePlacePhoto } from '../domain/placePhoto'
import type { PlacePhoto as Photo } from '../domain/placePhoto'
import places from '../data/photoPilotPlaces.json'
import './placePhotos.css'

type Status = {
  configured: boolean
  limit: number
  used: number
  consumed: string[]
  token: string
}
function PhotoCard({
  place,
  status,
  onComplete,
}: {
  place: (typeof places)[number]
  status: Status | null
  onComplete: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [message, setMessage] = useState('')
  async function load() {
    if (busy || attempted || !status?.configured) return
    setBusy(true)
    setAttempted(true)
    try {
      const response = await fetch('/api/place-photos/lookup', {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(40_000),
        headers: { 'Content-Type': 'application/json', 'X-Photo-Token': status.token },
        body: JSON.stringify({ id: place.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '写真を取得できませんでした。')
      setPhoto(data.photo ? decodePlacePhoto(data.photo) : null)
      setMessage(data.reason)
    } catch (e) {
      setMessage(
        e instanceof Error && e.name !== 'TimeoutError'
          ? e.message
          : '通信を確認できませんでした。自動再試行はしません。',
      )
    } finally {
      setBusy(false)
      onComplete()
    }
  }
  return (
    <article className="event-card photo-pilot-card">
      {photo ? (
        <PlacePhoto photo={photo} name={place.name} />
      ) : (
        <SpotIllustration kind="cafe" className="event-photo" />
      )}
      <div className="event-card-body">
        <h2>{place.name}</h2>
        <p>{place.address}</p>
        <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer">
          店舗公式の案内
        </a>
        <PrimaryButton
          onClick={() => void load()}
          disabled={!status?.configured || busy || attempted || status.consumed.includes(place.id)}
        >
          {busy
            ? '店舗を照合して写真を取得中…'
            : photo
              ? '写真を取得しました'
              : attempted || status?.consumed.includes(place.id)
                ? '初回の取得は実行済み'
                : 'このお店の写真を確認する'}
        </PrimaryButton>
        {message && (
          <p role="status" className="photo-pilot-note">
            {message}
          </p>
        )}
      </div>
    </article>
  )
}
export default function PlacePhotoPilot() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  async function refresh() {
    try {
      const response = await fetch('/api/place-photos/status', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error()
      setStatus(await response.json())
      setError('')
    } catch {
      setError('検証サーバーに接続できません。Macで npm run photos:dev を起動してください。')
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  return (
    <div className="screen photo-pilot-screen">
      <Header back />
      <div className="page-pad">
        <p className="eyebrow teal">PHOTO PILOT · 3 PLACES</p>
        <h1>
          お店の写真を
          <br />
          確かめる。
        </h1>
        <p className="body-copy">
          京都の3店舗で、写真とお店の一致を確認します。対象外のお店はイラストのままです。
        </p>
        <div className="info-box">
          <p>ボタンを押した店舗だけ取得します。各店1回・1枚、最大3店舗です。</p>
          <p>
            写真はこの画面を開いている間だけ表示します。画面を離れると破棄し、再読み込みで追加取得はしません。
          </p>
          <p>
            Googleへ店舗名・住所を送信し、写真の配信元には接続元のIPアドレス等が伝わります。個人の検索履歴や現在地は送りません。
          </p>
          <a
            href="https://maps.google.com/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Mapsの利用規約
          </a>{' '}
          ·{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            プライバシーポリシー
          </a>
        </div>
        <p role="status" className="photo-pilot-note">
          {error ||
            (!status
              ? '準備状況を確認しています…'
              : !status.configured
                ? 'Google Places用のAPIキーの設定を待っています。'
                : `${status.used} / ${status.limit} 店舗の取得を実行済み`)}
        </p>
        <button className="text-button" onClick={() => void refresh()}>
          設定状況を再確認
        </button>
        <div className="photo-pilot-list">
          {places.map((place) => (
            <PhotoCard
              key={place.id}
              place={place}
              status={status}
              onComplete={() => void refresh()}
            />
          ))}
        </div>
        <article className="event-card photo-pilot-card">
          <SpotIllustration kind="nature" className="event-photo" />
          <div className="event-card-body">
            <h2>それ以外の候補</h2>
            <p>ジャンルに合うイラストを表示します。写真APIは呼びません。</p>
          </div>
        </article>
      </div>
    </div>
  )
}
