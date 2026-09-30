import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealMapState } from '../domain/realStations'
import { locationLifetime, nearbyBounds } from '../domain/nearbyStations'
import type { LocationFix } from '../domain/nearbyStations'
import { locateOnce } from '../platform/location'
import { useApp } from './AppState'
import { App as NativeApp } from '@capacitor/app'
import { isNativeApp } from '../platform/runtime'

type Session = { map: RealMapState; point: LocationFix; nearby: boolean; key: number }
type LocationContext = {
  session: Session | null
  map: RealMapState
  loading: boolean
  error: string
  patch: (values: Partial<RealMapState>) => void
  useViewport: () => void
  locate: () => Promise<boolean>
  cancel: () => void
  reset: () => void
}
const Context = createContext<LocationContext | null>(null)

/** GPS-derived views live here only. They never enter AppState, Preferences or localStorage. */
export function LocationSearchProvider({ children }: { children: ReactNode }) {
  const { state, update } = useApp()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const running = useRef(false)
  const cancel = useCallback(() => {
    sequence.current++
    running.current = false
    setLoading(false)
  }, [])
  const reset = useCallback(() => {
    cancel()
    setSession(null)
    setError('')
  }, [cancel])
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(
      reset,
      Math.max(0, session.point.timestamp + locationLifetime - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [session?.point.timestamp, reset])
  useEffect(() => {
    const hide = () => {
      // An OS permission dialog can temporarily hide the web view. A pending result
      // is still ignored below if the document has not returned to the foreground.
      if (document.hidden && !running.current) reset()
    }
    document.addEventListener('visibilitychange', hide)
    // WKWebView does not reliably emit visibilitychange on iOS backgrounding.
    // 'pause' is didEnterBackground, so the permission alert itself is not a reset.
    const nativeListener = isNativeApp ? NativeApp.addListener('pause', reset) : null
    return () => {
      document.removeEventListener('visibilitychange', hide)
      void nativeListener?.then((handle) => handle.remove()).catch(() => {})
      sequence.current++
    }
  }, [reset])
  useEffect(() => {
    if (!state.onboarded) reset()
  }, [state.onboarded, reset])
  const map = session
    ? {
        ...session.map,
        mode: state.realMap.mode,
        type: state.realMap.type,
        providers: state.realMap.providers,
      }
    : state.realMap
  const patch = (values: Partial<RealMapState>) => {
    if (!session) {
      update((s) => ({ ...s, realMap: { ...s.realMap, ...values } }))
      return
    }
    setSession((s) => s && { ...s, map: { ...s.map, ...values } })
    // Only non-location preferences can be persisted while using GPS.
    const shared: Partial<RealMapState> = {}
    if (values.mode !== undefined) shared.mode = values.mode
    if (values.type !== undefined) shared.type = values.type
    if (values.providers !== undefined) shared.providers = values.providers
    if (Object.keys(shared).length) update((s) => ({ ...s, realMap: { ...s.realMap, ...shared } }))
  }
  const locate = async () => {
    if (running.current) return false
    running.current = true
    const request = ++sequence.current
    setLoading(true)
    setError('')
    setSession(null)
    try {
      const point = await locateOnce()
      if (sequence.current !== request || document.hidden) return false
      setSession({
        key: request,
        point,
        nearby: true,
        map: {
          ...state.realMap,
          center: { lat: point.lat, lng: point.lng },
          zoom: 14,
          bounds: nearbyBounds(point),
          query: '',
          appliedArea: '現在地から約2km',
          unsupported: false,
          selected: null,
        },
      })
      return true
    } catch (e) {
      if (sequence.current === request)
        setError(e instanceof Error ? e.message : '現在地を取得できませんでした。')
      return false
    } finally {
      if (sequence.current === request) {
        running.current = false
        setLoading(false)
      }
    }
  }
  return (
    <Context.Provider
      value={{
        session,
        map,
        loading,
        error,
        patch,
        useViewport: () => setSession((s) => s && { ...s, nearby: false }),
        locate,
        cancel,
        reset,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useLocationSearch() {
  const value = useContext(Context)
  if (!value) throw new Error('LocationSearchProvider is required')
  return value
}
