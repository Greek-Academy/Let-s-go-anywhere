import { useRef } from 'react'
import { CarFront, KeyRound } from 'lucide-react'
import type { Station } from '../data/types'

export function MapArtwork({ area = '渋谷' }: { area?: string }) {
  return (
    <svg
      className="map-artwork"
      viewBox="0 0 390 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="blocks"
          width="86"
          height="92"
          patternTransform="rotate(9)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="86" height="92" fill="#e9efeb" />
          <rect x="6" y="7" width="64" height="69" rx="4" fill="#e0e7e2" />
          <path d="M0 84h86M78 0v92" fill="none" stroke="#fff" strokeWidth="9" />
          <path
            d="M12 18h19v22H12zm24 0h25v16H36zM12 46h23v23H12zm30-8h19v31H42z"
            fill="#d5dfd9"
            opacity=".7"
          />
        </pattern>
      </defs>
      <rect width="390" height="720" fill="url(#blocks)" />
      <path
        d="M217-40c-24 109-66 163-45 265s47 140 36 237 37 183 69 297"
        fill="none"
        stroke="#b4d6df"
        strokeWidth="28"
      />
      <path d="M12 72 119 57l-8 126-97 10Z" fill="#c7dfc7" />
      <path d="m267 165 95-21 12 124-103 8Z" fill="#c1ddc4" />
      <path d="m59 408 81 12 22 110-104 12Z" fill="#d1e1c9" />
      <path d="m264 471 96-8 19 93-112 23Z" fill="#c8dfc6" />
      <g fill="none" strokeLinecap="round">
        <path d="M-30 605 414 250" stroke="#cfdbd3" strokeWidth="25" />
        <path d="M-30 605 414 250" stroke="#fff" strokeWidth="18" />
        <path d="M-30 605 414 250" stroke="#f7f1de" strokeWidth="7" />
        <path
          d="M-10 242 413 204M-10 356 414 332M78-20 35 751M314-20 351 741M-10 640 413 580"
          stroke="#fff"
          strokeWidth="13"
        />
        <path d="M246-20 206 759" stroke="#d5d7d1" strokeWidth="7" />
        <path d="M246-20 206 759" stroke="#fafafa" strokeWidth="3" strokeDasharray="6 4" />
      </g>
      <g fill="#99aa9f" fontFamily="sans-serif" fontSize="10">
        <text x="34" y="142">
          代々木公園
        </text>
        <text x="284" y="224">
          緑の広場
        </text>
        <text x="49" y="325">
          神南
        </text>
        <text x="278" y="374">
          宮益坂
        </text>
        <text x="103" y="560">
          桜丘町
        </text>
        <text x="277" y="629">
          東
        </text>
      </g>
      <rect x="191" y="365" width="81" height="27" rx="6" fill="#fff" stroke="#d4e1da" />
      <text
        x="231"
        y="383"
        textAnchor="middle"
        fontFamily="sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#55766b"
      >
        {area}駅
      </text>
      <g fill="#b2cbb5">
        <circle cx="47" cy="98" r="8" />
        <circle cx="76" cy="114" r="11" />
        <circle cx="306" cy="184" r="12" />
        <circle cx="338" cy="253" r="8" />
        <circle cx="90" cy="474" r="9" />
      </g>
    </svg>
  )
}
export function RentalMap({
  stations,
  selected,
  onSelect,
  offset,
  onPan,
  area,
}: {
  stations: Station[]
  selected: string | null
  onSelect: (station: Station) => void
  offset: { x: number; y: number }
  onPan: (offset: { x: number; y: number }) => void
  area: string
}) {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; scale: number } | null>(null)
  return (
    <div className="rental-map" aria-label={`${area}周辺の拠点地図（サンプル）`}>
      <div
        className="map-pan-surface"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            ox: offset.x,
            oy: offset.y,
            scale: e.currentTarget.getBoundingClientRect().width / e.currentTarget.offsetWidth,
          }
        }}
        onPointerMove={(e) => {
          if (drag.current)
            onPan({
              x: Math.max(
                -65,
                Math.min(65, drag.current.ox + (e.clientX - drag.current.x) / drag.current.scale),
              ),
              y: Math.max(
                -65,
                Math.min(65, drag.current.oy + (e.clientY - drag.current.y) / drag.current.scale),
              ),
            })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <div
          className="map-transform"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        >
          <MapArtwork area={area} />
          {stations.map((s) => (
            <button
              key={s.id}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              className={`map-pin ${s.type === 'レンタカー' ? 'rental' : 'share'} ${selected === s.id ? 'selected' : ''}`}
              onClick={() => onSelect(s)}
              aria-label={`${s.name}・${s.type}の詳細カード`}
              aria-pressed={selected === s.id}
            >
              <span className="map-pin-body">
                {s.type === 'レンタカー' ? (
                  <CarFront size={22} strokeWidth={1.7} />
                ) : (
                  <KeyRound size={20} strokeWidth={1.7} />
                )}
              </span>
            </button>
          ))}
          <div
            className="current-location"
            style={{ left: '51%', top: '56%' }}
            aria-label="現在地の表示サンプル"
          >
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}
