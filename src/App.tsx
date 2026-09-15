import { ContentProvider } from './content/ContentProvider'
import { sampleCatalog } from './content/sampleCatalog'
import type { ContentCatalog } from './content/catalog'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppStateProvider, useApp } from './state/AppState'
import { MobileFrame } from './components/MobileFrame'
import { EmptyState, Header } from './components/ui'
import { Onboarding, Welcome } from './screens/Onboarding'
import { Discover, EventDetail } from './screens/Discover'
import { Arrival } from './screens/Arrival'
import { Saved } from './screens/Saved'
import { Cars, StationDetail } from './screens/Cars'
import { CheckSetup, Learn, LearningDetail, Quiz, Results } from './screens/Learning'
import {
  ConsultationMemo,
  ConsultationStatus,
  SchoolDetail,
  Schools,
  SharingReview,
} from './screens/Schools'
import {
  AppSettings,
  ConsultationHistory,
  LearningHistory,
  Profile,
  ProfileEdit,
  Reflection,
} from './screens/Profile'

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
  return (
    <MobileFrame>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/onboarding/:step" element={<Onboarding />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/arrival" element={<Arrival />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/cars" element={<Cars />} />
        <Route path="/stations/:id" element={<StationDetail />} />
        <Route path="/check" element={<CheckSetup />} />
        <Route path="/quiz/:index" element={<Quiz />} />
        <Route path="/results" element={<Results />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:id" element={<LearningDetail />} />
        <Route path="/schools" element={<Schools />} />
        <Route path="/schools/:id" element={<SchoolDetail />} />
        <Route path="/consult/:id" element={<ConsultationMemo />} />
        <Route path="/consult/:id/review" element={<SharingReview />} />
        <Route path="/consultations/:id" element={<ConsultationStatus />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<ProfileEdit />} />
        <Route path="/profile/learning" element={<LearningHistory />} />
        <Route path="/profile/consultations" element={<ConsultationHistory />} />
        <Route path="/settings" element={<AppSettings />} />
        <Route path="/reflection" element={<Reflection />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MobileFrame>
  )
}
export default function App({ catalog = sampleCatalog }: { catalog?: ContentCatalog }) {
  return (
    <ContentProvider catalog={catalog}>
      <AppStateProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AppStateProvider>
    </ContentProvider>
  )
}
