import { createRealMapState } from '../domain/realStations'
import type { RealMapState } from '../domain/realStations'
import { userProfile } from '../data/options'
import type { WebSpot } from '../domain/webSearch'
import type { DiscoveryRegion } from '../data/regions'
import type { CarSearchConditions } from '../domain/carSearch'
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
  realMap: RealMapState
  carSearch: CarSearchConditions
  searchConditions: TripConditions
  conditionFilter: ConditionFilter
  outingConditions: Record<string, TripConditions>
  onboarded: boolean
  profile: UserProfile
  savedEvents: string[]
  savedWebSpots: WebSpot[]
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
  /** Retired demo records: preserve for v1 compatibility; no active UI or sending. */
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
  discover: { category: string; search: string; tag: string; region: DiscoveryRegion }
  /** Retired filters retained only for v1 storage compatibility. */
  schoolFilters: { area: string; practice: string; budget: string; vehicle: string }
  settings: { largeText: boolean; reducedMotion: boolean }
}
export const createInitialState = (): AppState => ({
  realMap: createRealMapState(),
  carSearch: { area: null, type: 'すべて', provider: null },
  searchConditions: emptyConditions(),
  conditionFilter: 'all',
  outingConditions: {},
  onboarded: false,
  profile: { ...userProfile, interests: [] },
  savedEvents: [],
  savedWebSpots: [],
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
  discover: { category: 'おすすめ', search: '', tag: '', region: 'origin' },
  schoolFilters: { area: 'すべて', practice: 'すべて', budget: 'すべて', vehicle: 'すべて' },
  settings: { largeText: false, reducedMotion: false },
})
