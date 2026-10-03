import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../state/AppState'
import { createDemoRepository, createMemoryStore } from './repository'
import type { SharingSnapshot } from './repository'
import { emptySharing, SHARING_KEY } from './model'
import type { Actor, Command, CommandResult } from './model'

interface SharingContext extends SharingSnapshot {
  actor: Actor
  setActor: (actor: Actor) => void
  pending: boolean
  ready: boolean
  error: string | null
  refresh: () => Promise<void>
  run: (command: Command, expectedVersion?: string | null) => Promise<CommandResult | null>
  clear: () => Promise<boolean>
}
const Context = createContext<SharingContext | null>(null)
export function SharingProvider({ children }: { children: ReactNode }) {
  const { memoryOnly } = useApp()
  const repo = useMemo(
    () => createDemoRepository(memoryOnly ? createMemoryStore() : undefined),
    [memoryOnly],
  )
  const [snapshot, setSnapshot] = useState<SharingSnapshot>({
    state: emptySharing(),
    version: null,
  })
  const [actor, setActor] = useState<Actor>('self')
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const errorMessage = (e: unknown) =>
    e instanceof Error
      ? e.message
      : '保存できませんでした。内容を確認して、もう一度お試しください。'
  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      setSnapshot(await repo.read())
      setError(null)
      setReady(true)
    } catch (e) {
      setSnapshot({ state: emptySharing(), version: null })
      setReady(false)
      setError(errorMessage(e))
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [repo])
  useEffect(() => {
    void refresh()
    const resume = () => {
      if (!document.hidden) void refresh()
    }
    const changed = (e: StorageEvent) => {
      if (e.key === SHARING_KEY || e.key === null) void refresh()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('storage', changed)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('storage', changed)
    }
  }, [refresh])
  const run = async (command: Command, expectedVersion = snapshot.version) => {
    if (busy.current || !ready) return null
    busy.current = true
    setPending(true)
    setError(null)
    try {
      const result = await repo.execute(actor, command, expectedVersion)
      setSnapshot({ state: result.state, version: result.version })
      return result
    } catch (e) {
      setError(errorMessage(e))
      return null
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  const clear = async () => {
    if (busy.current) return false
    busy.current = true
    setPending(true)
    try {
      await repo.clear()
      setSnapshot({ state: emptySharing(), version: null })
      setActor('self')
      setError(null)
      setReady(true)
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <Context.Provider
      value={{
        ...snapshot,
        actor,
        setActor: (next) => {
          if (!busy.current) {
            setActor(next)
            setError(null)
          }
        },
        pending,
        ready,
        error,
        refresh,
        run,
        clear,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useSharing() {
  const context = useContext(Context)
  if (!context) throw new Error('SharingProvider is required')
  return context
}
