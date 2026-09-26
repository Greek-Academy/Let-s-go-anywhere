import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createInitialState } from './model'
import type { AppState } from './model'
import { readStoredState, writeStoredState, STORAGE_KEY } from './storage'
import type { StorageProblem } from './storage'
import { stateStore } from '../platform/stateStore'
import { isNativeApp } from '../platform/runtime'
import { Share } from '@capacitor/share'
export { createInitialState, STORAGE_KEY }
export type { AppState }

type StateContext = {
  memoryOnly: boolean
  state: AppState
  update: (fn: (current: AppState) => AppState) => void
  toast: (text: string) => void
  message: string
  toggleEvent: (id: string) => void
  toggleStation: (id: string) => void
  reset: () => Promise<boolean>
  storagePending: boolean
  storageProblem: StorageProblem | null
  storageProtected: boolean
  retryStorage: () => void
  downloadStoredData: () => void
  storageError: boolean
}
const Context = createContext<StateContext | null>(null)
export function AppStateProvider({
  children,
  persistenceMode = 'device',
  initialState,
}: {
  children: ReactNode
  persistenceMode?: 'device' | 'memory'
  initialState?: AppState
}) {
  const memoryOnly = persistenceMode === 'memory'
  const persistence = useRef<{
    raw: string | null
    blocked: boolean
    protected: boolean
    problem: StorageProblem | null
  }>({ raw: null, blocked: false, protected: false, problem: null })
  const [state, setState] = useState<AppState>(() => {
    const loaded = memoryOnly
      ? { state: structuredClone(initialState ?? createInitialState()), raw: null, problem: null }
      : readStoredState()
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
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const resetting = useRef(false)
  const [storagePending, setStoragePending] = useState(false)
  const persist = useCallback((value: AppState, retry = false) => {
    pending.current += 1
    setStoragePending(true)
    // Native writes are asynchronous. Serialize them so rapid edits, StrictMode
    // effects and reset cannot overtake each other or overwrite a failed write.
    queue.current = queue.current.then(async () => {
      try {
        if (resetting.current || (persistence.current.blocked && !retry)) return
        if (persistedState.current === value) return
        const result = await writeStoredState(value, persistence.current.raw)
        persistence.current.raw = result.raw
        persistence.current.blocked = !!result.problem
        persistence.current.problem = result.problem
        if (!result.problem) persistedState.current = value
        if (result.problem === 'changed') persistence.current.protected = true
        setStorageProblem(result.problem)
      } finally {
        pending.current -= 1
        setStoragePending(pending.current > 0)
      }
    })
  }, [])
  useEffect(() => {
    // Reading an existing record must not rewrite it or create a false conflict in another tab.
    if (!memoryOnly && !persistence.current.blocked && state !== persistedState.current)
      persist(state)
  }, [state, persist, memoryOnly])
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
  const reset = async () => {
    if (memoryOnly) {
      setState(createInitialState())
      return true
    }
    if (resetting.current) return false
    resetting.current = true
    const operation = queue.current.then(async () => {
      try {
        await stateStore.removeItem(STORAGE_KEY)
        persistence.current = { raw: null, blocked: false, protected: false, problem: null }
        persistedState.current = null
        setStorageProblem(null)
        setState(createInitialState())
        return true
      } catch {
        toast('保存データを削除できませんでした。端末の保存領域を確認してください。')
        return false
      } finally {
        resetting.current = false
      }
    })
    queue.current = operation.then(() => undefined)
    return operation
  }
  const downloadStoredData = async () => {
    if (memoryOnly) {
      toast('確認用の操作内容は、この画面を開いている間だけ保持します。')
      return
    }
    try {
      const raw = await stateStore.getItem(STORAGE_KEY)
      if (raw === null) {
        toast('ダウンロードできる保存データがありません。')
        return
      }
      if (isNativeApp) {
        // The user chooses Copy or a destination in the system sheet. No upload.
        await Share.share({ title: 'Drive+ 保存されている元データ', text: raw })
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
      toast('元データの取り出しを完了しませんでした。保存データは変更していません。')
    }
  }
  return (
    <Context.Provider
      value={{
        memoryOnly,
        state,
        update,
        message,
        toast,
        toggleEvent,
        toggleStation,
        reset,
        storagePending,
        storageError: !!storageProblem,
        storageProblem,
        storageProtected: persistence.current.protected,
        retryStorage: () => {
          if (!memoryOnly && !persistence.current.protected) persist(state, true)
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
