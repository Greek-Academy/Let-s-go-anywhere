import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createInitialState } from './model'
import type { AppState } from './model'
import { readStoredState, writeStoredState, STORAGE_KEY } from './storage'
import type { StorageProblem } from './storage'
export { createInitialState, STORAGE_KEY }
export type { AppState }

type StateContext = {
  state: AppState
  update: (fn: (current: AppState) => AppState) => void
  toast: (text: string) => void
  message: string
  toggleEvent: (id: string) => void
  toggleStation: (id: string) => void
  reset: () => boolean
  storageProblem: StorageProblem | null
  storageProtected: boolean
  retryStorage: () => void
  downloadStoredData: () => void
  storageError: boolean
}
const Context = createContext<StateContext | null>(null)
export function AppStateProvider({ children }: { children: ReactNode }) {
  const persistence = useRef<{
    raw: string | null
    blocked: boolean
    protected: boolean
    problem: StorageProblem | null
  }>({ raw: null, blocked: false, protected: false, problem: null })
  const [state, setState] = useState<AppState>(() => {
    const loaded = readStoredState()
    persistence.current = {
      raw: loaded.raw,
      blocked: !!loaded.problem,
      protected: !!loaded.problem,
      problem: loaded.problem,
    }
    return loaded.state
  })
  const persistedState = useRef<AppState | null>(persistence.current.raw === null ? null : state)
  const [message, setMessage] = useState('')
  const [storageProblem, setStorageProblem] = useState<StorageProblem | null>(
    () => persistence.current.problem,
  )
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const persist = useCallback((value: AppState) => {
    const result = writeStoredState(value, persistence.current.raw)
    persistence.current.raw = result.raw
    persistence.current.blocked = !!result.problem
    persistence.current.problem = result.problem
    if (!result.problem) persistedState.current = value
    if (result.problem === 'changed') persistence.current.protected = true
    setStorageProblem(result.problem)
  }, [])
  useEffect(() => {
    // Reading an existing record must not rewrite it or create a false conflict in another tab.
    if (!persistence.current.blocked && state !== persistedState.current) persist(state)
  }, [state, persist])
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
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      toast('保存データを削除できませんでした。ブラウザの設定を確認してください。')
      return false
    }
    persistence.current = { raw: null, blocked: false, protected: false, problem: null }
    setStorageProblem(null)
    setState(createInitialState())
    return true
  }
  const downloadStoredData = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === null) {
        toast('ダウンロードできる保存データがありません。')
        return
      }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'driveplus-local-backup.json'
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast('保存データを取り出せませんでした。ブラウザの設定を確認してください。')
    }
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
        reset,
        storageError: !!storageProblem,
        storageProblem,
        storageProtected: persistence.current.protected,
        retryStorage: () => {
          if (!persistence.current.protected) persist(state)
        },
        downloadStoredData,
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
