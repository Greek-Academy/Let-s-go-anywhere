import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ContentCatalog } from './catalog'

const ContentContext = createContext<ContentCatalog | null>(null)

export function ContentProvider({
  catalog,
  children,
}: {
  catalog: ContentCatalog
  children: ReactNode
}) {
  return <ContentContext.Provider value={catalog}>{children}</ContentContext.Provider>
}

export function useContent(): ContentCatalog {
  const catalog = useContext(ContentContext)
  if (!catalog) throw new Error('ContentProvider is required')
  return catalog
}
