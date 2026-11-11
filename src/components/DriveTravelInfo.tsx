import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DriveTravel } from '../domain/driveSearch'
import { travelTimeLabel } from '../domain/driveSearch'

export function DriveTravelInfo({
  travel,
  compact = false,
  showAttribution = true,
}: {
  travel?: DriveTravel
  compact?: boolean
  showAttribution?: boolean
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!travel || travel.status === 'unconfirmed') return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(travel.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [travel])
  const current =
    travel && travel.status !== 'unconfirmed' && Date.parse(travel.expiresAt) > now ? travel : null
  if (compact)
    return (
      <div className="drive-travel-info drive-travel-compact">
        <p>
          <Clock3 size={16} aria-hidden="true" />
          <span>
            {current
              ? `車で片道 約${travelTimeLabel(current.durationSeconds)}`
              : '車での所要時間は未確認'}
          </span>
        </p>
        {current?.status === 'calculated' && showAttribution && (
          <span className="drive-maps-attribution" translate="no">
            Google Maps
          </span>
        )}
        {current?.status === 'sample' && (
          <span className="small muted">操作確認用の架空の時間</span>
        )}
      </div>
    )
  return (
    <div className="drive-travel-info">
      <p>
        <Clock3 size={16} aria-hidden="true" />
        <strong>
          {current
            ? `車で片道 約${travelTimeLabel(current.durationSeconds)}`
            : '車での所要時間は未確認'}
        </strong>
      </p>
      {current ? (
        <>
          <p className="small">
            {current.status === 'sample' ? (
              '操作確認用の架空の時間'
            ) : (
              <span className="drive-maps-attribution" translate="no">
                Google Maps
              </span>
            )}{' '}
            · 約{Math.round(current.distanceMeters / 1000)}km
          </p>
          <p className="small muted">
            {current.status === 'calculated'
              ? '概略の出発地と候補名・地域から計算。渋滞・休憩は含みません。車の入口は別途確認してください。'
              : '実際の移動時間ではありません。'}
          </p>
        </>
      ) : (
        <p className="small muted">
          時間条件に合うか未確認です。経路情報を取得できた候補には目安を表示します。
        </p>
      )}
      <details className="small muted">
        <summary>所要時間・評価の情報について</summary>
        <p>
          経路計算や評価の表示にはGoogle
          Mapsの利用規約とプライバシーポリシーが適用されます。候補の名前と地域をGoogleに送り、評価を確認します。所要時間・評価は表示中だけ利用し、行きたいリストや共有リストには保存しません。
        </p>
        <p>
          湖や山など住所がない場所の確認には、スポットの位置と
          <a href="https://maps.gsi.go.jp/" target="_blank" rel="noopener noreferrer">
            国土地理院の情報
          </a>
          を加工して利用する場合があります。送るのはスポットの位置で、ご自身の現在地ではありません。
        </p>
        <p>
          <a
            href="https://maps.google.com/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Mapsの利用規約
          </a>
          {' · '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            プライバシーポリシー
          </a>
        </p>
      </details>
    </div>
  )
}
