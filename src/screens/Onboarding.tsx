import { HobbyChoices } from '../components/DriveSearchControls'
import { ArrowLeft, ArrowRight } from 'lucide-react'
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
  if (step !== '1') return <Navigate to={state.onboarded ? '/discover' : '/onboarding/1'} replace />
  const finish = () => {
    update((s) => ({ ...s, onboarded: true }))
    navigate('/discover', { replace: true })
  }
  return (
    <div className="onboarding-page hobbies-onboarding">
      <div className="onboarding-header">
        <IconButton icon={ArrowLeft} label="戻る" onClick={() => navigate('/welcome')} />
        <span className="onboarding-label">趣味の設定</span>
      </div>
      <div className="onboarding-content">
        <span className="eyebrow teal">DRIVE TO SOMETHING YOU LOVE</span>
        <h1>
          好きなことを、
          <br />
          ドライブのきっかけに。
        </h1>
        <p className="body-copy">
          選んだ趣味と現在地から、ドライブ先やイベントを探します。複数選べます。あとから変更もできます。
        </p>
        <HobbyChoices
          value={state.profile.interests}
          onChange={(values) =>
            update((s) => ({ ...s, profile: { ...s.profile, interests: values } }))
          }
        />
        <p className="small muted" aria-live="polite">
          {state.profile.interests.length}個の趣味を選択中
        </p>
      </div>
      <div className="onboarding-footer">
        <p className="small muted">
          ホームを開くと現在地を取得しておすすめを探します。約100m単位の位置と趣味をAI検索に、位置を経路計算に使用します。許可しない場合は駅からも探せます。
        </p>
        <PrimaryButton onClick={finish} icon={ArrowRight}>
          ドライブ先を見つける
        </PrimaryButton>
        <button className="text-button skip-button" onClick={finish}>
          スキップ
        </button>
      </div>
    </div>
  )
}
