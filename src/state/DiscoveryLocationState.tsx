import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { isNativeApp } from '../platform/runtime'
import { locateOnce } from '../platform/location'
import { locationLifetime } from '../domain/nearbyStations'
import { coarseCenter } from '../domain/discoveryLocation'
import type { DiscoveryCenter } from '../domain/discoveryLocation'
import { useApp } from './AppState'

type Fix = { center: DiscoveryCenter; timestamp: number; accuracy: number }
type LocationContext = {
  enabled: boolean
  fix: Fix | null
  loading: boolean
  error: string
  locate: () => Promise<boolean>
  cancel: () => void
  reset: () => void
}
const Context = createContext<LocationContext | null>(null)

/** Independent from the car map; neither the selection nor coordinates enter persistence. */
export function DiscoveryLocationProvider({ children }: { children: ReactNode }) {
  const { state } = useApp()
  const [enabled, setEnabled] = useState(false)
  const [fix, setFix] = useState<Fix | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const cancel = useCallback(() => {
    sequence.current++
    controller.current?.abort()
    controller.current = null
    setLoading(false)
  }, [])
  const expire = useCallback(() => {
    cancel()
    setFix(null)
    setError('')
  }, [cancel])
  const reset = useCallback(() => {
    expire()
    setEnabled(false)
  }, [expire])
  useEffect(() => {
    if (!fix) return
    const timer = setTimeout(expire, Math.max(0, fix.timestamp + locationLifetime - Date.now()))
    return () => clearTimeout(timer)
  }, [fix, expire])
  useEffect(() => {
    const hide = () => {
      // OS permission dialogs may briefly hide the document. Native pause handles real backgrounding.
      if (document.hidden && !controller.current) expire()
    }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', expire)
    window.addEventListener('driveplus-search-session-change', reset)
    const listener = isNativeApp ? NativeApp.addListener('pause', expire) : null
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', expire)
      window.removeEventListener('driveplus-search-session-change', reset)
      void listener?.then((h) => h.remove()).catch(() => {})
      sequence.current++
      controller.current?.abort()
    }
  }, [expire, reset])
  useEffect(() => {
    if (!state.onboarded) reset()
  }, [state.onboarded, reset])
  const locate = async () => {
    if (controller.current) return false
    const request = ++sequence.current
    const abort = new AbortController()
    controller.current = abort
    setLoading(true)
    setError('')
    try {
      const point = await locateOnce(abort.signal)
      if (request !== sequence.current || document.hidden) return false
      setFix({
        center: coarseCenter(point),
        timestamp: point.timestamp,
        accuracy: Math.ceil(point.accuracy),
      })
      setEnabled(true)
      return true
    } catch (e) {
      if (request === sequence.current && !(e instanceof DOMException && e.name === 'AbortError'))
        setError(e instanceof Error ? e.message : '現在地を取得できませんでした。')
      return false
    } finally {
      if (request === sequence.current) {
        controller.current = null
        setLoading(false)
      }
    }
  }
  return (
    <Context.Provider value={{ enabled, fix, loading, error, locate, cancel, reset }}>
      {children}
    </Context.Provider>
  )
}
export function useDiscoveryLocation() {
  const value = useContext(Context)
  if (!value) throw new Error('DiscoveryLocationProvider is required')
  return value
}
