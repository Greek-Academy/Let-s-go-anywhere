import { ArrowLeft, ArrowRight, Check, MapPin, Search, Sparkles } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { companions, interests } from '../data/mockData'
import { Brand, Choice, IconButton, PrimaryButton } from '../components/ui'

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
        <div className="welcome-dots">
          <span className="active" />
          <span />
          <span />
        </div>
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
  const { step: raw } = useParams()
  const step = Number(raw)
  const navigate = useNavigate()
  const { state, update } = useApp()
  if (![1, 2, 3].includes(step)) return <Navigate to="/onboarding/1" replace />
  const profile = state.profile
  const next = () => {
    if (step < 3) navigate(`/onboarding/${step + 1}`)
    else {
      update((s) => ({
        ...s,
        onboarded: true,
        map: { ...s.map, area: s.profile.area || '東京・渋谷駅周辺' },
      }))
      navigate('/discover', { replace: true })
    }
  }
  const setProfile = (data: Partial<typeof profile>) =>
    update((s) => ({ ...s, profile: { ...s.profile, ...data } }))
  return (
    <div className="onboarding-page">
      <div className="onboarding-header">
        <IconButton
          icon={ArrowLeft}
          label="戻る"
          onClick={() => navigate(step === 1 ? '/welcome' : `/onboarding/${step - 1}`)}
        />
        <div className="step-progress">
          {[1, 2, 3].map((i) => (
            <span className={i <= step ? 'active' : ''} key={i} />
          ))}
        </div>
        <span className="step-count">{step} / 3</span>
      </div>
      <div className="onboarding-content">
        <span className="eyebrow teal">LET'S FIND YOUR WEEKEND</span>
        <h1>
          {step === 1 ? (
            <>
              どこから、
              <br />
              お出かけしますか？
            </>
          ) : step === 2 ? (
            <>
              誰と、どんな時間を
              <br />
              過ごしたいですか？
            </>
          ) : (
            <>
              心が動くものを、
              <br />
              選んでください。
            </>
          )}
        </h1>
        <p className="body-copy">
          {step === 1
            ? '出発エリアに合わせて、休日のヒントをお届け。'
            : step === 2
              ? 'あなたらしいお出かけを見つけましょう。'
              : 'いくつ選んでも大丈夫。あとから変更できます。'}
        </p>
        {step === 1 && (
          <>
            <label className="search-field onboarding-search">
              <Search size={19} />
              <input
                aria-label="出発エリア"
                placeholder="駅名・市区町村を入力"
                value={profile.area}
                onChange={(e) => setProfile({ area: e.target.value })}
              />
            </label>
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
            <p className="field-caption">たとえば、こんなエリア</p>
            <div className="chips wrap">
              {['東京・渋谷駅周辺', '東京・新宿駅周辺', '神奈川・横浜駅周辺'].map((area) => (
                <button
                  className={`area-suggestion ${profile.area === area ? 'selected' : ''}`}
                  key={area}
                  onClick={() => setProfile({ area })}
                >
                  <MapPin size={14} />
                  {area}
                  {profile.area === area && <Check size={13} />}
                </button>
              ))}
            </div>
            <p className="muted small">位置情報の許可は必要ありません。</p>
          </>
        )}
        {step === 2 && (
          <div className="companion-choices">
            {companions.map((c) => (
              <Choice
                key={c.name}
                selected={profile.companion === c.name}
                title={c.name}
                description={c.text}
                icon={c.emoji}
                onClick={() => setProfile({ companion: c.name })}
              />
            ))}
          </div>
        )}
        {step === 3 && (
          <>
            <div className="interest-grid">
              {interests.map((interest) => {
                const selected = profile.interests.includes(interest.name)
                return (
                  <button
                    key={interest.name}
                    className={`interest-tile ${selected ? 'selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() =>
                      setProfile({
                        interests: selected
                          ? profile.interests.filter((v) => v !== interest.name)
                          : [...profile.interests, interest.name],
                      })
                    }
                  >
                    <img src={interest.image} alt="" />
                    <span className="interest-check">{selected && <Check size={13} />}</span>
                    <strong>{interest.name}</strong>
                    <small>{interest.caption}</small>
                  </button>
                )
              })}
            </div>
            <p className="interest-selection">
              <Sparkles size={15} />
              {profile.interests.length
                ? `${profile.interests.length}つの「好き」を選択中`
                : '気になるものをタップ'}
            </p>
          </>
        )}
      </div>
      <div className="onboarding-footer">
        <PrimaryButton onClick={next} icon={ArrowRight}>
          {step === 3 ? 'おすすめを見る' : '次へ'}
        </PrimaryButton>
        <button className="text-button skip-button" onClick={next}>
          スキップ
        </button>
      </div>
    </div>
  )
}
