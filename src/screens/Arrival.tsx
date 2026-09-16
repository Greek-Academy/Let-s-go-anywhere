import { japanDate } from '../domain/dates'
import { useContent, useContentTime } from '../content/ContentProvider'
import { useState } from 'react'
import { ArrowRight, CameraOff, CarFront, MapPin } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { unknownFact } from '../domain/evidence'
import type { ArrivalPhoto } from '../data/arrivalGuides'

import { confirmedValue, evidenceLabels, evidenceState } from '../domain/evidence'
import type { Evidence } from '../domain/evidence'
import {
  EmptyState,
  ExternalModal,
  Header,
  PrimaryButton,
  SampleNote,
  Tag,
  useBack,
} from '../components/ui'

function Fact({ fact }: { fact: Evidence<string> }) {
  const at = japanDate(useContentTime())
  const status = evidenceState(fact, at)
  return (
    <div className="arrival-fact">
      <Tag tone={status === 'confirmed' ? 'mint' : 'neutral'}>{evidenceLabels[status]}</Tag>
      <p>
        {confirmedValue(fact, at) ??
          (status === 'expired'
            ? '確認期限を過ぎたため、以前の情報の表示を控えています。'
            : '確認できた情報がありません。施設の案内を確認してください。')}
      </p>
      {fact.source && <small>確認元：{fact.source}</small>}
      {fact.checkedAt && (
        <small>
          確認日：{fact.checkedAt} ／ 再確認期限：{fact.reviewBy ?? '未設定'}
        </small>
      )}
    </div>
  )
}

export function ArrivalImage({ photo }: { photo?: ArrivalPhoto }) {
  const [failedSrc, setFailedSrc] = useState('')
  const at = japanDate(useContentTime())
  if (!photo || !confirmedValue(photo.permission, at) || failedSrc === photo.src) {
    return (
      <div className="arrival-photo-empty">
        <CameraOff size={21} />
        <span>
          {photo && evidenceState(photo.permission, at) === 'withdrawn'
            ? '写真は利用停止中です'
            : '掲載できる写真はありません'}
          <small>文章で確認できる情報をまとめています。</small>
        </span>
      </div>
    )
  }
  return (
    <figure className="arrival-photo">
      <img src={photo.src} alt={photo.alt} loading="lazy" onError={() => setFailedSrc(photo.src)} />
      <figcaption>{photo.permission.value}</figcaption>
    </figure>
  )
}

function EntranceDiagram() {
  return (
    <figure className="entrance-diagram">
      <svg
        viewBox="0 0 340 184"
        role="img"
        aria-label="架空の配置例。車入口は下側の道路沿い、歩行者入口は建物側で別の場所です。"
      >
        <rect width="340" height="184" rx="18" fill="#eff5f0" />
        <rect x="20" y="22" width="117" height="85" rx="8" fill="#d8e5df" />
        <text x="78" y="57" textAnchor="middle" fill="#35594e" fontSize="13">
          施設
        </text>
        <path d="M20 143H320" stroke="white" strokeWidth="36" />
        <rect x="175" y="22" width="143" height="85" rx="8" fill="#d1e9e1" />
        <text x="247" y="50" textAnchor="middle" fill="#35594e" fontSize="13">
          第1駐車場
        </text>
        <path d="M210 63v25m29-25v25m29-25v25m29-25v25" stroke="white" strokeWidth="3" />
        <path d="M247 145V97m-7 8 7-9 7 9" fill="none" stroke="#148b7d" strokeWidth="4" />
        <circle cx="78" cy="96" r="14" fill="#75928c" />
        <text x="78" y="101" textAnchor="middle" fill="white" fontSize="13">
          人
        </text>
        <text x="78" y="122" textAnchor="middle" fill="#526e62" fontSize="11">
          歩行者入口
        </text>
        <text x="247" y="171" textAnchor="middle" fill="#086f64" fontSize="12">
          車入口（架空）
        </text>
      </svg>
      <figcaption>位置関係の概念図です。実際の施設・経路を示しません。</figcaption>
    </figure>
  )
}

export function ArrivalTeaser({ outingId }: { outingId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <button
      className="arrival-teaser"
      onClick={() => navigate(`/events/${outingId}/arrival`, { state: location.state })}
    >
      <span className="round-icon">
        <CarFront size={23} />
      </span>
      <span>
        <small>到着前の下見</small>
        <strong>最後の500mを、見ておこう。</strong>
        <span>車の入口・駐車場・入出庫の流れ</span>
      </span>
      <ArrowRight size={18} />
    </button>
  )
}

export function Arrival() {
  const { outings, arrivalGuides } = useContent()
  const at = japanDate(useContentTime())
  const { id } = useParams()
  const navigate = useNavigate()
  const [external, setExternal] = useState(false)
  const back = useBack(`/events/${id}`)
  const outing = outings.find((o) => o.id === id)
  const guide = id ? arrivalGuides[id] : undefined
  const stopped =
    outing?.lifecycle?.availability === 'withdrawn' || guide?.availability === 'withdrawn'
  const visible = !stopped && guide?.availability === 'published' ? guide : undefined
  const entrance = visible ? confirmedValue(visible.vehicleEntrance, at) : null
  if (!outing)
    return (
      <>
        <Header back title="到着前の下見" />
        <EmptyState
          title="お出かけが見つかりません"
          description="一覧からお出かけを選んでください。"
          action="見つけるに戻る"
          onAction={() => navigate('/discover')}
        />
      </>
    )
  return (
    <div className="screen arrival-screen">
      <Header back={back} title="到着前の下見" />
      <div className="page-pad">
        <p className="eyebrow teal">BEFORE YOU ARRIVE</p>
        <h1>
          最後の500mを、
          <br />
          見ておこう。
        </h1>
        <p className="body-copy">{outing.title}</p>
        <SampleNote>確認状態を含む架空のサンプルです。実際の施設情報は未確認です。</SampleNote>
        <p className="body-copy">
          車の入口を知っておく。帰り方も見ておく。
          <br />
          出発前や停車中に、気になることをひとつずつ。
        </p>
        {stopped ? (
          <div className="notice">
            この下見カードは掲載を停止しています。以前の情報は表示していません。
          </div>
        ) : (
          <>
            <section className="arrival-panel">
              <h2>
                <CarFront size={19} /> 車の入口
              </h2>
              {entrance && <EntranceDiagram />}
              <Fact
                fact={
                  visible
                    ? {
                        ...visible.vehicleEntrance,
                        value: visible.vehicleEntrance.value?.description ?? null,
                      }
                    : unknownFact()
                }
              />
              <ArrivalImage photo={visible?.photo} />
              {entrance && (
                <PrimaryButton variant="secondary" icon={MapPin} onClick={() => setExternal(true)}>
                  車入口の地図案内を確認（デモ）
                </PrimaryButton>
              )}
            </section>
            <section className="arrival-panel">
              <h2>歩行者の入口</h2>
              <Fact fact={visible?.pedestrianEntrance ?? unknownFact()} />
            </section>
            <section className="arrival-panel">
              <h2>駐車場と利用条件</h2>
              <div className="notice">
                駐車場の存在と空き状況は別です。空き状況は取得していません。
              </div>
              {(
                visible?.facts ??
                ['駐車場の形式', '車両サイズ', '営業時間・入出庫', '予約の要否', '支払い方法'].map(
                  (label) => ({ label, fact: unknownFact<string>() }),
                )
              ).map(({ label, fact }) => (
                <div className="arrival-row" key={label}>
                  <h3>{label}</h3>
                  <Fact fact={fact} />
                </div>
              ))}
            </section>
            <section className="arrival-panel">
              <h2>入庫から、帰るまで</h2>
              <ol className="arrival-steps">
                {(
                  visible?.steps ?? [{ title: '入庫から退出まで', fact: unknownFact<string>() }]
                ).map((step, index) => (
                  <li key={step.title}>
                    <span className="step-number">{index + 1}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <Fact fact={step.fact} />
                      {step.photo && <ArrivalImage photo={step.photo} />}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="arrival-panel">
              <h2>ほかの駐車場所</h2>
              <Fact
                fact={
                  visible
                    ? {
                        ...visible.alternatives,
                        value: visible.alternatives.value?.join('\n') ?? null,
                      }
                    : unknownFact()
                }
              />
              <p className="body-copy">代替候補も、利用条件や所在地の事前確認が必要です。</p>
            </section>
          </>
        )}
        <PrimaryButton onClick={back}>お出かけ詳細に戻る</PrimaryButton>
      </div>
      {external && entrance && (
        <ExternalModal
          kind="map"
          title={entrance?.mapLabel ?? ''}
          onClose={() => setExternal(false)}
        />
      )}
    </div>
  )
}
