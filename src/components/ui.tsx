import { useId, useLayoutEffect, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  CarFront,
  Check,
  ChevronRight,
  Heart,
  House,
  Map,
  MessageCircle,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tab } from '../data/types'

export function useBack(fallback = '/discover') {
  const navigate = useNavigate()
  return () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}
export function PrimaryButton({
  children,
  variant = 'primary',
  icon: Icon,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: LucideIcon
}) {
  return (
    <button type="button" className={`button button-${variant} ${className}`} {...props}>
      {Icon && <Icon size={18} strokeWidth={1.9} />}
      <span>{children}</span>
    </button>
  )
}
export function IconButton({
  icon: Icon,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      data-focus-key={`icon:${label}`}
      {...props}
    >
      <Icon size={21} strokeWidth={1.8} />
    </button>
  )
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`}>
      <CarFront size={small ? 20 : 24} strokeWidth={1.8} />
      <span>
        Drive<span className="brand-plus">+</span>
      </span>
    </span>
  )
}
export function Header({
  title,
  back = false,
  right,
  transparent = false,
}: {
  title?: string
  back?: boolean | (() => void)
  right?: ReactNode
  transparent?: boolean
}) {
  const navigate = useNavigate()
  const goBack = useBack()
  const location = useLocation()
  return (
    <header className={`app-header ${transparent ? 'transparent' : ''}`}>
      <div className="header-leading">
        {back ? (
          <IconButton
            icon={ArrowLeft}
            label="戻る"
            onClick={typeof back === 'function' ? back : goBack}
          />
        ) : (
          <Brand small />
        )}
      </div>
      {title && <span className="header-title">{title}</span>}
      <div className="header-trailing">
        {right ?? (
          <IconButton
            icon={UserRound}
            label="マイページを開く"
            className="profile-button"
            onClick={() =>
              navigate('/profile', {
                state: { tab: activeTab(location.pathname, location.state?.tab) },
              })
            }
          />
        )}
      </div>
    </header>
  )
}
export function activeTab(path: string, origin?: Tab): Tab {
  if (origin) return origin
  if (/^\/(cars|stations)/.test(path)) return 'cars'
  if (/^\/(schools|consult|consultations)/.test(path)) return 'schools'
  if (/^\/(learn|check|quiz|results)/.test(path)) return 'learn'
  if (/^\/saved/.test(path)) return 'saved'
  return 'discover'
}
const tabs: { id: Tab; title: string; icon: LucideIcon }[] = [
  { id: 'discover', title: '見つける', icon: House },
  { id: 'saved', title: '行きたい', icon: Heart },
  { id: 'cars', title: '車を探す', icon: Map },
  { id: 'learn', title: '学ぶ', icon: BookOpen },
  { id: 'schools', title: '講習', icon: MessageCircle },
]
export function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = activeTab(location.pathname, location.state?.tab)
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      {tabs.map(({ id, title, icon: Icon }) => (
        <button
          key={id}
          className={`nav-item ${current === id ? 'active' : ''} ${id === 'cars' ? 'nav-map' : ''}`}
          onClick={() => navigate(`/${id}`)}
          aria-current={current === id ? 'page' : undefined}
        >
          <span className="nav-icon">
            <Icon
              size={22}
              strokeWidth={current === id ? 2.2 : 1.65}
              fill={current === id && id === 'discover' ? 'currentColor' : 'none'}
            />
          </span>
          <span>{title}</span>
        </button>
      ))}
      <div className="home-indicator" />
    </nav>
  )
}
export function Chip({
  children,
  selected,
  onClick,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      className={`chip ${selected ? 'selected' : ''} ${className}`}
      aria-pressed={selected}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )
}
export function Tag({ children, tone = 'mint' }: { children: ReactNode; tone?: string }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}
export function SectionHeading({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  )
}
export function EmptyState({
  icon: Icon = Search,
  title,
  description,
  action,
  onAction,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={29} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <PrimaryButton variant="secondary" onClick={onAction}>
          {action}
        </PrimaryButton>
      )}
    </div>
  )
}
export function SampleNote({ children }: { children?: ReactNode }) {
  return (
    <p className="sample-note">
      <span />
      {children ?? '写真・掲載情報は、画面確認用のサンプルです。'}
    </p>
  )
}
export function Choice({
  selected,
  title,
  description,
  icon,
  onClick,
}: {
  selected: boolean
  title: string
  description?: string
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`choice ${selected ? 'selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {icon && <span className="choice-icon">{icon}</span>}
      <span className="choice-text">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="selection-mark">{selected && <Check size={13} strokeWidth={3} />}</span>
    </button>
  )
}
export function Overlay({
  children,
  title,
  onClose,
  type = 'sheet',
}: {
  children: ReactNode
  title: string
  onClose: () => void
  type?: 'sheet' | 'modal'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  const startY = useRef(0)
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const nodes = [
      document.querySelector('.app-main'),
      document.querySelector('.bottom-nav'),
      document.querySelector('.storage-notice'),
    ].filter(Boolean) as HTMLElement[]
    nodes.forEach((node) => {
      node.inert = true
    })
    const getFocusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null)
    ;(getFocusable()[0] ?? ref.current)?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      }
      if (e.key === 'Tab') {
        const list = getFocusable()
        const first = list[0]
        if (!first) {
          e.preventDefault()
          return
        }
        // Keep every control, including links, in the dialog tab order in WebKit.
        e.preventDefault()
        const index = list.indexOf(document.activeElement as HTMLElement)
        const next =
          index < 0
            ? e.shiftKey
              ? list.length - 1
              : 0
            : (index + (e.shiftKey ? -1 : 1) + list.length) % list.length
        list[next].focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      nodes.forEach((node) => {
        node.inert = false
      })
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  const target = document.getElementById('overlay-root')
  if (!target) return null
  return createPortal(
    <div className={`overlay overlay-${type}`}>
      <div className="overlay-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={type === 'sheet' ? 'bottom-sheet' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {type === 'sheet' && (
          <div
            className="sheet-drag-zone"
            onPointerDown={(e) => {
              startY.current = e.clientY
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerUp={(e) => {
              if (e.clientY - startY.current > 45) onClose()
            }}
          >
            <span className="sheet-handle" />
          </div>
        )}
        <div className="overlay-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={X} label="閉じる" onClick={onClose} />
        </div>
        <div className="overlay-content">{children}</div>
      </div>
    </div>,
    target,
  )
}
export function BottomSheet(props: Omit<Parameters<typeof Overlay>[0], 'type'>) {
  return <Overlay {...props} />
}
export function Modal(props: Omit<Parameters<typeof Overlay>[0], 'type'>) {
  return <Overlay {...props} type="modal" />
}
export function InfoRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="info-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
export function MenuRow({
  icon: Icon,
  title,
  value,
  onClick,
}: {
  icon: LucideIcon
  title: string
  value?: string
  onClick: () => void
}) {
  return (
    <button className="menu-row" data-focus-key={`menu:${title}`} onClick={onClick}>
      <Icon size={20} strokeWidth={1.7} />
      <span>{title}</span>
      {value && <small>{value}</small>}
      <ChevronRight size={17} />
    </button>
  )
}
