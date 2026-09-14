export type Tab = 'discover' | 'saved' | 'cars' | 'learn' | 'schools'
export type StationType = 'すべて' | 'レンタカー' | 'カーシェア'
export interface Outing {
  id: string
  title: string
  subtitle: string
  image: string
  area: string
  kind: 'event' | 'spot'
  tags: string[]
  date: string
  description: string
  source: string
  weekend: boolean
  mood: string
  price: string
}
export interface Station {
  id: string
  name: string
  type: Exclude<StationType, 'すべて'>
  provider: string
  area: string
  address: string
  x: number
  y: number
  hours: string
  conditions: string
  returnPolicy: string
  checkedAt: string
}
export interface School {
  id: string
  name: string
  area: string[]
  practices: string[]
  price: number
  duration: string
  feature: string
  teacher: string
  initial: string
  color: string
  vehicles: string[]
  description: string
}
export interface Question {
  id: string
  category: string
  title: string
  prompt: string
  options: string[]
  correct: number
  explanation: string
  scene: 'road' | 'parking' | 'highway'
}
export interface LearningContent {
  id: string
  title: string
  category: string
  time: number
  image: string
  uses: string[]
  introduction: string
  pages: { title: string; text: string }[]
}
export interface UserProfile {
  name: string
  area: string
  companion: string
  interests: string[]
}
export interface ConsultationMemo {
  goal: string
  when: string
  vehicle: string
  questions: string
}
export type SharedField =
  'goal' | 'when' | 'vehicle' | 'questions' | 'experience' | 'concerns' | 'knowledge'
export interface Consultation {
  id: string
  schoolId: string
  createdAt: string
  status: '送信済み（デモ）' | '相談受付（デモ）' | 'キャンセル（デモ）'
  consentAt: string
  shared: SharedField[]
  snapshot: Partial<Record<SharedField, string>>
}
export interface SavedLink {
  id: string
  url: string
  title: string
  source: string
  addedAt: string
}
export interface Reflection {
  id: string
  type: string
  outcome: string
  note: string
  advice: string
  createdAt: string
}
