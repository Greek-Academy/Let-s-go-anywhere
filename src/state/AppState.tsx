import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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

export const STORAGE_KEY = 'driveplus.mock.v1'
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
function readState(): AppState {
  const initial = createInitialState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initial
    const data = JSON.parse(raw)
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray(data.savedEvents) ||
      !Array.isArray(data.profile?.interests)
    )
      return initial
    return {
      ...initial,
      ...data,
      searchConditions: { ...initial.searchConditions, ...data.searchConditions },
      profile: { ...initial.profile, ...data.profile },
      map: { ...initial.map, ...data.map },
      quiz: { ...initial.quiz, ...data.quiz },
      settings: { ...initial.settings, ...data.settings },
    }
  } catch {
    return initial
  }
}
type StateContext = {
  state: AppState
  update: (fn: (current: AppState) => AppState) => void
  toast: (text: string) => void
  message: string
  toggleEvent: (id: string) => void
  toggleStation: (id: string) => void
  reset: () => void
  storageError: boolean
}
const Context = createContext<StateContext | null>(null)
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(readState)
  const [message, setMessage] = useState('')
  const [storageError, setStorageError] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state])
  useEffect(() => () => clearTimeout(timer.current), [])
  const toast = useCallback((text: string) => {
    clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(''), 2800)
  }, [])
  const update = useCallback((fn: (current: AppState) => AppState) => setState(fn), [])
  const toggleEvent = (id: string) => {
    const saved = state.savedEvents.includes(id)
    update((s) => ({
      ...s,
      savedEvents: saved ? s.savedEvents.filter((v) => v !== id) : [...s.savedEvents, id],
    }))
    toast(saved ? '行きたいから外しました' : '行きたいに保存しました')
  }
  const toggleStation = (id: string) => {
    const saved = state.savedStations.includes(id)
    update((s) => ({
      ...s,
      savedStations: saved ? s.savedStations.filter((v) => v !== id) : [...s.savedStations, id],
    }))
    toast(saved ? '車候補から外しました' : '車候補に保存しました')
  }
  return (
    <Context.Provider
      value={{
        state,
        update,
        message,
        toast,
        toggleEvent,
        toggleStation,
        reset: () => setState(createInitialState()),
        storageError,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useApp() {
  const value = useContext(Context)
  if (!value) throw new Error('AppStateProvider is required')
  return value
}
