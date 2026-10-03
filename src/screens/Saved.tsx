import { PrivateListSelector } from '../sharing/components'
import { realStations } from '../domain/realStations'
import { RealStationCard } from './RealCars'
import { ExternalModal } from '../components/ExternalLinkModal'
import { OutingImage, OutingStatus, OutingPhotoCredit } from '../components/OutingStatus'
import { useContent } from '../content/ContentProvider'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CarFront, ChevronRight, Heart, Link2, Plus, Trash2 } from 'lucide-react'

import { useApp } from '../state/AppState'
import { StationCard } from '../components/Cards'
import { Chip, EmptyState, Header, IconButton, PrimaryButton, Tag } from '../components/ui'
import { SnsSheet } from './Discover'
import { useWebSearch } from '../state/WebSearchState'
import { WebSpotImage, WebSpotStatus, WebSpotSource } from '../components/WebSpotCard'

export function Saved() {
  const { outings, stations } = useContent()
  const { state, update, toggleEvent, toast, storageProtected } = useApp()
  const { toggleSaved } = useWebSearch()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const current = params.get('type') === 'cars' ? 'cars' : 'events'
  const [sns, setSns] = useState(false)
  const [external, setExternal] = useState<string | null>(null)
  const externalLink = state.links.find((link) => link.id === external)
  const eventList = outings.filter((o) => state.savedEvents.includes(o.id))
  const realStationList = realStations.filter((station) => state.savedStations.includes(station.id))
  const missingStations = state.savedStations.filter(
    (id) => id.startsWith('osm-') && !realStations.some((station) => station.id === id),
  )
  const stationList = stations.filter((s) => state.savedStations.includes(s.id))
  return (
    <div className="screen">
      <Header />
      <div className="page-pad">
        <p className="eyebrow teal">YOUR LITTLE WISHLIST</p>
        <div className="title-with-icon">
          <h1>
            楽しみを、
            <br />
            とっておこう。
          </h1>
          <Heart size={35} strokeWidth={1.2} />
        </div>
        <p className="body-copy">「行きたい」が増えると、休日が楽しみになる。</p>
        <PrivateListSelector />
        <div className="segmented">
          <Chip
            selected={current === 'events'}
            onClick={() => setParams({ type: 'events' }, { replace: true })}
          >
            お出かけ{' '}
            <span>{eventList.length + state.links.length + state.savedWebSpots.length}</span>
          </Chip>
          <Chip
            selected={current === 'cars'}
            onClick={() => setParams({ type: 'cars' }, { replace: true })}
          >
            車候補{' '}
            <span>{stationList.length + realStationList.length + missingStations.length}</span>
          </Chip>
        </div>
        {current === 'events' ? (
          <>
            <div className="saved-list">
              {eventList.map((o) => (
                <article className="saved-outing" key={o.id}>
                  <button
                    data-focus-key={`saved-event:${o.id}`}
                    onClick={() => navigate(`/events/${o.id}`, { state: { tab: 'saved' } })}
                  >
                    <OutingImage outing={o} decorative />
                    <span>
                      <OutingStatus outing={o} />
                      <strong>{o.title}</strong>
                      <small>{o.area}</small>
                      <OutingPhotoCredit outing={o} />
                      {state.goals[o.id]?.when && <small>{state.goals[o.id].when}</small>}
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <IconButton
                    icon={Heart}
                    label={`${o.title}を保存解除`}
                    className="heart-active"
                    onClick={() => toggleEvent(o.id)}
                  />
                </article>
              ))}
            </div>
            {state.savedWebSpots.length > 0 && (
              <>
                <h2 className="saved-subheading">Webで見つけた候補</h2>
                <p className="small muted">この端末に保存した、内容未確認の候補です。</p>
                <div className="saved-list">
                  {state.savedWebSpots.map((spot) => (
                    <div key={spot.id} className="saved-web-spot">
                      <article className="saved-outing">
                        <button
                          data-focus-key={`saved-web:${spot.id}`}
                          onClick={() =>
                            navigate(`/web-spots/${spot.id}`, { state: { tab: 'saved' } })
                          }
                        >
                          <WebSpotImage />
                          <span>
                            <WebSpotStatus spot={spot} />
                            <strong>{spot.name}</strong>
                            <small>{spot.area}</small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        <IconButton
                          icon={Heart}
                          label={`${spot.name}を保存解除`}
                          disabled={storageProtected}
                          className="heart-active"
                          onClick={() => toggleSaved(spot)}
                        />
                      </article>
                      <WebSpotSource spot={spot} />
                    </div>
                  ))}
                </div>
              </>
            )}
            {state.links.length > 0 && (
              <>
                <h2 className="saved-subheading">SNSからの「行きたい」</h2>
                {state.links.map((link) => (
                  <article className="saved-link" key={link.id}>
                    <div className="saved-link-top">
                      <span className="round-icon small-round">
                        <Link2 size={19} />
                      </span>
                      <div>
                        <Tag tone="peach">内容未確認</Tag>
                        <h3>{link.title}</h3>
                      </div>
                      <IconButton
                        icon={Trash2}
                        label={`${link.title}を削除`}
                        onClick={() => {
                          update((s) => ({ ...s, links: s.links.filter((l) => l.id !== link.id) }))
                          toast('保存リンクを削除しました')
                        }}
                      />
                    </div>
                    <p className="link-url">{link.url}</p>
                    <button className="text-button" onClick={() => setExternal(link.id)}>
                      元の投稿を確認 <ArrowRight size={14} />
                    </button>
                  </article>
                ))}
              </>
            )}
            {eventList.length + state.links.length + state.savedWebSpots.length === 0 && (
              <EmptyState
                icon={Heart}
                title="最初の「行きたい」を見つけよう"
                description="気になったお出かけのハートを押すと、ここに保存されます。"
                action="お出かけを見つける"
                onAction={() => navigate('/discover')}
              />
            )}
            <PrimaryButton variant="secondary" icon={Plus} onClick={() => setSns(true)}>
              SNSで見つけた場所を追加
            </PrimaryButton>
          </>
        ) : (
          <>
            <div className="station-list">
              {realStationList.map((station) => (
                <RealStationCard
                  key={station.id}
                  station={station}
                  onClick={() =>
                    navigate(`/cars/places/${station.id}`, { state: { tab: 'saved' } })
                  }
                />
              ))}
              {missingStations.map((id) => (
                <article className="real-source-card" key={id}>
                  <h3>保存した拠点の情報を確認できません</h3>
                  <p className="small muted">
                    現在の掲載データに見つかりません。閉店を意味するものではありません。保存記録は残っています。
                  </p>
                  <button
                    className="text-button"
                    disabled={storageProtected}
                    onClick={() =>
                      update((s) => ({
                        ...s,
                        savedStations: s.savedStations.filter((savedId) => savedId !== id),
                      }))
                    }
                  >
                    この車候補の保存を解除
                  </button>
                </article>
              ))}
              {stationList.map((s) => (
                <StationCard
                  key={s.id}
                  station={s}
                  savedAction
                  onClick={() => navigate(`/stations/${s.id}`, { state: { tab: 'saved' } })}
                />
              ))}
            </div>
            {!stationList.length && !realStationList.length && !missingStations.length && (
              <EmptyState
                icon={CarFront}
                title="借りる場所も、保存できます"
                description="車を探す地図から、気になる拠点を車候補に保存してみましょう。保存は予約ではありません。"
                action="出発地で車を探す"
                onAction={() => {
                  update((s) => ({
                    ...s,
                    map: { ...s.map, area: s.profile.area, query: '', selected: null },
                  }))
                  navigate('/cars')
                }}
              />
            )}
            <p className="muted small">空き状況・料金・予約は公式サービスで確認します。</p>
          </>
        )}
        <button
          className="car-banner"
          onClick={() => {
            update((s) => ({
              ...s,
              map: { ...s.map, area: s.profile.area, query: '', selected: null },
            }))
            navigate('/cars')
          }}
        >
          <CarFront size={27} />
          <span>
            <strong>出発地で車を探す</strong>
            <small>{state.profile.area}</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
      {sns && <SnsSheet onClose={() => setSns(false)} />}
      {externalLink && (
        <ExternalModal
          title={externalLink.title}
          kind="sns"
          request={{ type: 'personal', url: externalLink.url }}
          onClose={() => setExternal(null)}
        />
      )}
    </div>
  )
}
