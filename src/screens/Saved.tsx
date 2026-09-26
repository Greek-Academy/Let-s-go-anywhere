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

export function Saved() {
  const { outings, stations } = useContent()
  const { state, update, toggleEvent, toast } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const current = params.get('type') === 'cars' ? 'cars' : 'events'
  const [sns, setSns] = useState(false)
  const [external, setExternal] = useState<string | null>(null)
  const externalLink = state.links.find((link) => link.id === external)
  const eventList = outings.filter((o) => state.savedEvents.includes(o.id))
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
        <div className="segmented">
          <Chip
            selected={current === 'events'}
            onClick={() => setParams({ type: 'events' }, { replace: true })}
          >
            お出かけ <span>{eventList.length + state.links.length}</span>
          </Chip>
          <Chip
            selected={current === 'cars'}
            onClick={() => setParams({ type: 'cars' }, { replace: true })}
          >
            車候補 <span>{stationList.length}</span>
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
            {eventList.length + state.links.length === 0 && (
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
              {stationList.map((s) => (
                <StationCard
                  key={s.id}
                  station={s}
                  savedAction
                  onClick={() => navigate(`/stations/${s.id}`, { state: { tab: 'saved' } })}
                />
              ))}
            </div>
            {!stationList.length && (
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
