import { ContentProvider } from './content/ContentProvider'
import { sampleCatalog } from './content/sampleCatalog'
import type { ContentCatalog } from './content/catalog'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppStateProvider, useApp } from './state/AppState'
import { WebSearchProvider } from './state/WebSearchState'
import { LocationSearchProvider } from './state/LocationSearchState'
import { WebSpotDetail } from './screens/WebSpotDetail'
import type { AppState } from './state/model'
import { MobileFrame } from './components/MobileFrame'
import { EmptyState, Header } from './components/ui'
import { Onboarding, Welcome } from './screens/Onboarding'
import { Discover, EventDetail } from './screens/Discover'
import { Arrival } from './screens/Arrival'
import { Saved } from './screens/Saved'
import { RealCars, RealStationDetail, CarMapSources } from './screens/RealCars'
import { Cars, StationDetail } from './screens/Cars'
import { CarSearch } from './screens/CarSearch'
import { CheckSetup, Learn, LearningDetail, Quiz, Results } from './screens/Learning'
import { LearningNotes } from './screens/LearningNotes'
import { LearningColumnDetail } from './screens/LearningColumns'
import { AppSettings, LearningHistory, Profile, ProfileEdit, Reflection } from './screens/Profile'

function Start() {
  const { state } = useApp()
  return <Navigate to={state.onboarded ? '/discover' : '/welcome'} replace />
}
function NotFound() {
  const navigate = useNavigate()
  return (
    <>
      <Header back />
      <EmptyState
        title="ページが見つかりません"
        description="ホームから、もう一度お出かけを探せます。"
        action="ホームに戻る"
        onAction={() => navigate('/discover', { replace: true })}
      />
    </>
  )
}
function AppRoutes() {
  const { memoryOnly } = useApp()
  return (
    <MobileFrame>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/onboarding/:step" element={<Onboarding />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/web-spots/:id" element={<WebSpotDetail />} />
        <Route path="/events/:id/arrival" element={<Arrival />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/cars" element={memoryOnly ? <Cars /> : <RealCars />} />
        <Route path="/cars/sample" element={<Cars />} />
        <Route path="/cars/places/:id" element={<RealStationDetail />} />
        <Route path="/cars/sources" element={<CarMapSources />} />
        <Route path="/cars/search" element={<CarSearch />} />
        <Route path="/stations/:id" element={<StationDetail />} />
        <Route path="/check" element={<CheckSetup />} />
        <Route path="/quiz/:index" element={<Quiz />} />
        <Route path="/results" element={<Results />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/columns/:id" element={<LearningColumnDetail />} />
        <Route path="/learn/:id" element={<LearningDetail />} />
        {/* Replace retired URLs so Back never returns to a consultation form. */}
        <Route path="/schools/*" element={<Navigate to="/learn?retired=schools" replace />} />
        <Route path="/consult/*" element={<Navigate to="/learn?retired=schools" replace />} />
        <Route path="/consultations/*" element={<Navigate to="/learn?retired=schools" replace />} />
        <Route path="/learn/notes" element={<LearningNotes />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<ProfileEdit />} />
        <Route path="/profile/learning" element={<LearningHistory />} />
        <Route
          path="/profile/consultations"
          element={<Navigate to="/learn?retired=schools" replace />}
        />
        <Route path="/settings" element={<AppSettings />} />
        <Route path="/reflection" element={<Reflection />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MobileFrame>
  )
}
export default function App({
  catalog = sampleCatalog,
  persistence = 'device',
  initialState,
}: {
  catalog?: ContentCatalog
  persistence?: 'device' | 'memory'
  initialState?: AppState
}) {
  return (
    <ContentProvider catalog={catalog}>
      <AppStateProvider persistenceMode={persistence} initialState={initialState}>
        <WebSearchProvider>
          <LocationSearchProvider>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </LocationSearchProvider>
        </WebSearchProvider>
      </AppStateProvider>
    </ContentProvider>
  )
}
