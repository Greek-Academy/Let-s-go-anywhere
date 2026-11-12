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

type ToastAction = { label: string; run: () => void }
type StateContext = {
  memoryOnly: boolean
  state: AppState
  update: (fn: (current: AppState) => AppState) => void
  updateAndSave: (fn: (current: AppState) => AppState) => Promise<boolean>
  toast: (text: string, action?: ToastAction) => void
  messageAction: ToastAction | undefined
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
  const currentState = useRef(state)
  const [message, setMessage] = useState('')
  const [messageAction, setMessageAction] = useState<ToastAction>()
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
    const operation = queue.current.then(async () => {
      try {
        if (resetting.current || (persistence.current.blocked && !retry)) return false
        if (persistedState.current === value) return true
        const result = await writeStoredState(value, persistence.current.raw)
        persistence.current.raw = result.raw
        persistence.current.blocked = !!result.problem
        persistence.current.problem = result.problem
        if (!result.problem) persistedState.current = value
        if (result.problem === 'changed') persistence.current.protected = true
        setStorageProblem(result.problem)
        return !result.problem
      } finally {
        pending.current -= 1
        setStoragePending(pending.current > 0)
      }
    })
    queue.current = operation.then(() => undefined)
    return operation
  }, [])
  useEffect(() => {
    // Reading an existing record must not rewrite it or create a false conflict in another tab.
    if (!memoryOnly && !persistence.current.blocked && state !== persistedState.current)
      persist(state)
  }, [state, persist, memoryOnly])
  useEffect(() => () => clearTimeout(timer.current), [])
  const toast = useCallback((text: string, action?: ToastAction) => {
    clearTimeout(timer.current)
    setMessage(text)
    setMessageAction(action)
    // Undo remains available until dismissed, replaced, or used.
    if (!action) timer.current = setTimeout(() => setMessage(''), 2800)
  }, [])
  const update = useCallback((fn: (current: AppState) => AppState) => {
    const next = fn(currentState.current)
    currentState.current = next
    setState(next)
    return next
  }, [])
  const updateAndSave = useCallback(
    async (fn: (current: AppState) => AppState) => {
      if (resetting.current || persistence.current.protected) return false
      const next = update(fn)
      return memoryOnly || (await persist(next))
    },
    [memoryOnly, persist, update],
  )
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
      update(() => createInitialState())
      toast('')
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
        update(() => createInitialState())
        toast('')
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
        updateAndSave,
        messageAction,
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
