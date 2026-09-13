import { useState } from 'react'
import { Check, MapPin } from 'lucide-react'

export function RoadScene({
  scene = 'road',
  interactive = false,
}: {
  scene?: 'road' | 'parking' | 'highway'
  interactive?: boolean
}) {
  const [marked, setMarked] = useState<string[]>([])
  const highway = scene === 'highway'
  const parking = scene === 'parking'
  return (
    <div className={`road-scene ${interactive ? 'interactive' : ''}`}>
      <svg
        viewBox="0 0 360 228"
        role="img"
        aria-label={
          parking
            ? '車と歩行者がいる駐車場の場面イラスト'
            : highway
              ? '合流する道が見える道路場面のイラスト'
              : '建物のある住宅街、横断歩道、歩行者、前方の車のイラスト'
        }
      >
        <defs>
          <linearGradient id="roadSky" x2="0" y2="1">
            <stop stopColor="#b6dae7" />
            <stop offset="1" stopColor="#edf4f3" />
          </linearGradient>
          <linearGradient id="roadSurface" x2="0" y2="1">
            <stop stopColor="#99aba9" />
            <stop offset="1" stopColor="#607878" />
          </linearGradient>
        </defs>
        <rect width="360" height="228" fill="url(#roadSky)" />
        <g fill="#f8fcfc" opacity=".8">
          <ellipse cx="86" cy="29" rx="34" ry="7" />
          <ellipse cx="111" cy="28" rx="21" ry="9" />
          <ellipse cx="273" cy="40" rx="29" ry="8" />
        </g>
        <path
          d="m0 111 47-24 40 17 23-34 32 30 36-18 47 22 39-24 38 25 58-23v146H0Z"
          fill="#b0c9bf"
        />
        {!highway && (
          <>
            <path d="M0 17 67 52v134H0Z" fill="#e1e5d6" />
            <path d="m67 52 34 14v106l-34 14Z" fill="#c3cdbf" />
            <path d="m360 39-62 20v131h62Z" fill="#e9e3d3" />
            <path d="m298 59-31 21v95l31 15Z" fill="#cacbbd" />
            <path d="m111 68 32 16v66l-32 17Z" fill="#e9e8dc" />
            <path d="m247 75-27 16v59l27 12Z" fill="#cfd8d1" />
            <g fill="#8faeae">
              <path d="m10 44 17 7v22l-17-5Zm27 11 18 7v21l-18-6ZM10 86l17 5v23l-17-3Zm27 9 18 5v22l-18-3Zm-27 31 17 3v25l-17-1Zm27 6 18 3v24l-18-1Z" />
              <path d="m314 75 15-5v22l-15 4Zm24-8 14-5v23l-14 4Zm-24 42 15-3v24l-15 1Zm24-4 14-2v23l-14 1Z" />
              <path d="m116 86 10 4v14l-10-2Zm16 5 7 3v12l-7-1Z" />
            </g>
          </>
        )}
        <path d="m154 112 49 0 140 116H11Z" fill="url(#roadSurface)" />
        <path d="m151 112-9 0L0 218v10h15Zm55 0h8l146 98v18h-17Z" fill="#dce0d3" />
        <path
          d="m179 119 1 8m0 8 1 10m1 10 1 17m2 13 3 33"
          stroke="#f5f1db"
          strokeWidth="3"
          strokeDasharray={highway ? '12 8' : '0'}
        />
        {parking ? (
          <g stroke="#edf0e5" strokeWidth="3" fill="none">
            <path d="M53 194h81l22-56m-18 17H95m7 20H77M222 149h35m-25 22h53m-40 28h76M204 126l43 89" />
          </g>
        ) : (
          !highway && (
            <g fill="#faf9ed">
              <path d="m111 159 16 0-8 9h-17Zm24 0h16l-4 9h-18Zm25 0h15v9h-19Zm24 0h16l5 9h-19Zm24 0h16l11 9h-19Z" />
            </g>
          )
        )}
        {highway && (
          <>
            <path d="m285 122-32 45 92 61h15v-17l-74-47 32-42Z" fill="#98aaa5" />
            <path d="m293 128-26 34 76 55" stroke="#f7f7e8" strokeWidth="2" fill="none" />
            <rect x="124" y="55" width="102" height="30" rx="3" fill="#659683" />
            <path d="M139 85v40m72-40v40" stroke="#8b9f98" strokeWidth="3" />
            <path
              d="M153 77V64m-5 5 5-5 5 5m19 8V64m-5 5 5-5 5 5"
              stroke="#fff"
              fill="none"
              strokeWidth="2"
            />
            <path d="M84 164 8 212m258-45 81 49" stroke="#c7d9d0" strokeWidth="5" />
          </>
        )}
        <g>
          <path d="m140 132 3-14h26l5 14v16h-35Z" fill="#f2f3eb" stroke="#798e8d" />
          <path d="m147 120-3 11h25l-3-11Z" fill="#92b1b7" />
          <rect x="142" y="134" width="5" height="3" rx="1" fill="#d99282" />
          <rect x="165" y="134" width="5" height="3" rx="1" fill="#d99282" />
          <path d="M142 148v3m29-3v3" stroke="#405958" strokeWidth="4" />
        </g>
        {!highway && (
          <>
            <g transform="translate(247 128)">
              <circle cy="-16" r="4" fill="#bea388" />
              <path d="m-4-10-3 13h12L3-10Z" fill="#d8956e" />
              <path d="m-3 3-2 12m7-12 3 12" stroke="#586a68" strokeWidth="3" />
              <path d="m-4-8-7 9m14-9 5 8" stroke="#d8956e" strokeWidth="3" />
            </g>
            <g>
              <path d="M96 117v48m169-54v53" stroke="#8ca091" strokeWidth="4" />
              <circle cx="94" cy="112" r="16" fill="#95bba0" />
              <circle cx="265" cy="108" r="14" fill="#8db299" />
            </g>
            <path d="M81 148V95h19" stroke="#92a9a7" strokeWidth="2" />
            <rect x="95" y="91" width="15" height="10" rx="2" fill="#5d9a9a" />
            <path d="m99 97 4-3 4 3" stroke="#fff" fill="none" />
          </>
        )}
        <path d="M0 218q180-38 360 0v10H0Z" fill="#2b4648" />
        <path d="M26 219q56-18 92-6m15-3 75-3" stroke="#557072" strokeWidth="3" fill="none" />
      </svg>
      {interactive && (
        <>
          {[
            { id: 'left', x: 27, y: 58, label: '左側の見通し' },
            { id: 'person', x: 70, y: 57, label: '右側の歩行者' },
            { id: 'front', x: 44, y: 62, label: '前方の車' },
          ].map((point) => (
            <button
              key={point.id}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              className={`scene-hotspot ${marked.includes(point.id) ? 'marked' : ''}`}
              aria-label={`${point.label}を確認箇所に選ぶ`}
              aria-pressed={marked.includes(point.id)}
              onClick={() =>
                setMarked(
                  marked.includes(point.id)
                    ? marked.filter((v) => v !== point.id)
                    : [...marked, point.id],
                )
              }
            >
              {marked.includes(point.id) ? <Check size={15} /> : <MapPin size={14} />}
            </button>
          ))}
          <span className="scene-caption">タップして気になる場所をマーク</span>
        </>
      )}
    </div>
  )
}
