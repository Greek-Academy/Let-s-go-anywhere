import { userProfile } from '../data/options'
import type {
  Consultation,
  ConsultationMemo,
  Reflection,
  SavedLink,
  StationType,
  UserProfile,
} from '../data/types'

import { emptyConditions } from '../domain/tripConditions'
import type { TripConditions, ConditionFilter } from '../domain/tripConditions'

export interface AppState {
  searchConditions: TripConditions
  conditionFilter: ConditionFilter
  outingConditions: Record<string, TripConditions>
  onboarded: boolean
  profile: UserProfile
  savedEvents: string[]
  savedStations: string[]
  hiddenEvents: string[]
  links: SavedLink[]
  learned: string[]
  learningDates: Record<string, string>
  quiz: {
    experience: string
    concerns: string[]
    answers: Record<string, number | null>
    completed: boolean
  }
  memo: ConsultationMemo
  consultations: Consultation[]
  reflections: Reflection[]
  goals: Record<string, { companion: string; when: string; note: string }>
  map: {
    type: StationType
    providers: string[]
    area: string
    query: string
    mode: 'map' | 'list'
    selected: string | null
    offset: { x: number; y: number }
  }
  discover: { category: string; search: string; tag: string }
  schoolFilters: { area: string; practice: string; budget: string; vehicle: string }
  settings: { largeText: boolean; reducedMotion: boolean }
}
export const createInitialState = (): AppState => ({
  searchConditions: emptyConditions(),
  conditionFilter: 'all',
  outingConditions: {},
  onboarded: false,
  profile: { ...userProfile, interests: [] },
  savedEvents: [],
  savedStations: [],
  hiddenEvents: [],
  links: [],
  learned: [],
  learningDates: {},
  quiz: { experience: '', concerns: [], answers: {}, completed: false },
  memo: { goal: '', when: '', vehicle: '相談して決めたい', questions: '' },
  consultations: [],
  reflections: [],
  goals: {},
  map: {
    type: 'すべて',
    providers: [],
    area: '東京・渋谷駅周辺',
    query: '',
    mode: 'map',
    selected: null,
    offset: { x: 0, y: 0 },
  },
  discover: { category: 'おすすめ', search: '', tag: '' },
  schoolFilters: { area: 'すべて', practice: 'すべて', budget: 'すべて', vehicle: 'すべて' },
  settings: { largeText: false, reducedMotion: false },
})
