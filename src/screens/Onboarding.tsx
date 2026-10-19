import { StationPicker } from '../components/StationPicker'
import { railStation, stationRegion } from '../domain/railStations'
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { Brand, IconButton, PrimaryButton } from '../components/ui'

export function Welcome() {
  const navigate = useNavigate()
  const { update } = useApp()
  const skip = () => {
    update((s) => ({ ...s, onboarded: true }))
    navigate('/discover', { replace: true })
  }
  return (
    <div className="welcome">
      <img className="welcome-photo" src="/images/fuji.jpg" alt="富士山の見える風景" />
      <div className="welcome-shade" />
      <div className="welcome-top">
        <Brand />
        <span className="welcome-edition">YOUR NEXT WEEKEND</span>
      </div>
      <div className="welcome-copy">
        <p className="eyebrow">もっと、行ける場所が増える。</p>
        <h1>
          行きたいを、
          <br />
          行けるに。
        </h1>
        <p>
          いつか行きたかった、あの場所へ。
          <br />
          あなたの次の一歩を、一緒に。
        </p>
      </div>
      <div className="welcome-bottom">
        <PrimaryButton icon={ArrowRight} onClick={() => navigate('/onboarding/1')}>
          はじめる
        </PrimaryButton>
        <button className="welcome-skip" onClick={skip}>
          まずは見てみる <ArrowRight size={15} />
        </button>
        <p>登録不要 · あなたのペースで始められます</p>
      </div>
    </div>
  )
}
export function Onboarding() {
  const { step } = useParams()
  const navigate = useNavigate()
  const { state, update } = useApp()
  // Retired steps never render; replace them so Back cannot reopen those questions.
  if (step !== '1') return <Navigate to={state.onboarded ? '/discover' : '/onboarding/1'} replace />
  const profile = state.profile
  const finish = () => {
    update((s) => ({
      ...s,
      onboarded: true,
      map: { ...s.map, area: s.profile.area || s.map.area },
    }))
    navigate('/discover', { replace: true })
  }
  return (
    <div className="onboarding-page">
      <div className="onboarding-header">
        <IconButton icon={ArrowLeft} label="戻る" onClick={() => navigate('/welcome')} />
        <span className="onboarding-label">出発駅の設定</span>
      </div>
      <div className="onboarding-content">
        <span className="eyebrow teal">LET'S FIND YOUR WEEKEND</span>
        <h1>
          どこから、
          <br />
          お出かけしますか？
        </h1>
        <p className="body-copy">最寄駅を選ぶと、その周辺の休日のヒントを探せます。</p>
        <StationPicker
          label="出発する最寄駅"
          value={profile.stationId}
          onChange={(stationId) => {
            const station = railStation(stationId)
            update((s) => ({
              ...s,
              profile: {
                ...s.profile,
                stationId,
                ...(station ? { area: stationRegion(station) } : {}),
              },
            }))
          }}
        />
        {!profile.stationId && !!profile.area && (
          <p className="small muted">
            以前の設定：{profile.area}。候補から駅を選び直してください。
          </p>
        )}
        <div className="area-illustration" aria-hidden="true">
          <div className="area-grid" />
          <div className="area-park park-one" />
          <div className="area-park park-two" />
          <div className="area-river" />
          <div className="area-street one" />
          <div className="area-street two" />
          <span className="area-pin">
            <MapPin size={39} fill="currentColor" />
          </span>
          <span className="area-tag">ここから、楽しみが広がる。</span>
        </div>
        <p className="muted small">位置情報の許可は必要ありません。</p>
      </div>
      <div className="onboarding-footer">
        <PrimaryButton
          onClick={finish}
          disabled={!railStation(profile.stationId)}
          icon={ArrowRight}
        >
          ホームへ
        </PrimaryButton>
        <button className="text-button skip-button" onClick={finish}>
          スキップ
        </button>
      </div>
    </div>
  )
}
