import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

type Position = { scroll: number; focusKey?: string }

/** In-memory navigation state only; never persist DOM contents or user input. */
export function usePageNavigation(ref: RefObject<HTMLElement | null>, view = '') {
  const location = useLocation()
  const navigation = useNavigationType()
  const history = useRef(new Map<string, Position>())
  const previous = useRef<{
    path: string
    view: string
    locationKey: string
    entry: Position
  } | null>(null)

  useLayoutEffect(() => {
    const main = ref.current
    if (!main) return
    const key = `${location.key}:${view}`
    const old = previous.current
    const traversal = navigation === 'POP' && old?.locationKey !== location.key
    const sameScreen = old?.path === location.pathname && old.view === view
    const saved = history.current.get(key)
    const entry = saved ?? (sameScreen ? { ...old.entry } : { scroll: 0 })
    history.current.set(key, entry)
    // Bound tab-lifetime memory, including long sessions with repeated navigation.
    if (history.current.size > 100) history.current.delete(history.current.keys().next().value!)

    const heading =
      main.querySelector<HTMLElement>('h1') ?? main.querySelector<HTMLElement>('h2, h3') ?? main
    const title = heading.textContent?.replace(/\s+/g, ' ').trim()
    document.title = `${title || 'お出かけを見つける'} | Drive+`
    if (!sameScreen || (traversal && saved)) {
      const restored =
        traversal && saved?.focusKey
          ? [...main.querySelectorAll<HTMLElement>('[data-focus-key]')].find(
              (node) =>
                node.dataset.focusKey === saved.focusKey &&
                !node.matches(':disabled') &&
                node.getClientRects().length > 0,
            )
          : undefined
      const target = restored ?? heading
      if (!restored) target.tabIndex = -1
      main.scrollTop = saved?.scroll ?? 0
      // Do not jump past the photo/header, or raise the software keyboard on entry.
      if (!main.inert) target.focus({ preventScroll: true })
    }
    previous.current = { path: location.pathname, view, locationKey: location.key, entry }
    const rememberScroll = () => {
      entry.scroll = main.scrollTop
    }
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      entry.focusKey = target.dataset.focusKey
      rememberScroll()
    }
    const rememberClick = () => {
      rememberScroll()
    }
    main.addEventListener('scroll', rememberScroll)
    main.addEventListener('focusin', rememberFocus)
    main.addEventListener('click', rememberClick, true)
    return () => {
      main.removeEventListener('scroll', rememberScroll)
      main.removeEventListener('focusin', rememberFocus)
      main.removeEventListener('click', rememberClick, true)
    }
  }, [location.key, location.pathname, navigation, ref, view])
}
