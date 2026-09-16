import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ContentCatalog } from './catalog'

const ContentTime = createContext(new Date())

export function useContentTime(): Date {
  // Subscribe to time/focus updates, but read the clock again on every screen render.
  // A navigation immediately after a boundary must not reuse the previous timer tick.
  useContext(ContentTime)
  return new Date()
}

const ContentContext = createContext<ContentCatalog | null>(null)

export function ContentProvider({
  catalog,
  children,
}: {
  catalog: ContentCatalog
  children: ReactNode
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    refresh()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [catalog])
  return (
    <ContentContext.Provider value={catalog}>
      <ContentTime.Provider value={now}>{children}</ContentTime.Provider>
    </ContentContext.Provider>
  )
}

export function useContent(): ContentCatalog {
  const catalog = useContext(ContentContext)
  if (!catalog) throw new Error('ContentProvider is required')
  return catalog
}
