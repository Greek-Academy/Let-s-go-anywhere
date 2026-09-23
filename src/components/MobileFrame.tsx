import { StorageNotice } from './StorageStatus'
import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { BatteryFull, CarFront, Check, Signal, Wifi } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { usePageNavigation } from '../hooks/usePageNavigation'
import { BottomNavigation } from './ui'
import { isNativeApp } from '../platform/runtime'

export function MobileFrame({ children }: { children: ReactNode }) {
  const { state, message } = useApp()
  const location = useLocation()
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const welcome = location.pathname === '/welcome'
  const onboarding = welcome || location.pathname.startsWith('/onboarding')
  const map = location.pathname === '/cars' && state.map.mode === 'map'
  usePageNavigation(scrollRef, location.pathname === '/cars' ? state.map.mode : '')
  useLayoutEffect(() => {
    if (isNativeApp) return
    const stage = stageRef.current
    const frame = frameRef.current
    if (!stage || !frame) return
    const fitPhone = () => {
      // Keep the screen and its contents in proportion, even in a short PC window.
      const scale = Math.min(
        0.9,
        stage.clientWidth / frame.offsetWidth,
        stage.clientHeight / frame.offsetHeight,
      )
      stage.style.setProperty('--phone-scale', String(scale))
    }
    fitPhone()
    const observer = new ResizeObserver(fitPhone)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="desktop-stage">
      <div className="prototype-label">
        <CarFront size={17} />
        <span>Drive+</span>
        <i />
        INTERACTIVE MOCK
      </div>
      <div className="device-stage" ref={stageRef}>
        <div
          ref={frameRef}
          className={`mobile-frame ${state.settings.largeText ? 'large-text' : ''} ${state.settings.reducedMotion ? 'reduced-motion' : ''}`}
        >
          <div
            className={`phone-screen ${welcome ? 'welcome-screen' : ''}`}
            onClickCapture={(event) => {
              // WebKit does not focus a pointer-activated button by default. Record
              // the trigger before a sheet mounts, so closing it can return there.
              const button = (event.target as Element).closest<HTMLButtonElement>('button')
              if (button && !button.disabled) button.focus({ preventScroll: true })
            }}
          >
            <div className={`status-bar ${welcome ? 'status-light' : ''}`} aria-hidden="true">
              <span>9:41</span>
              <div className="dynamic-island" />
              <div className="status-icons">
                <Signal size={14} fill="currentColor" />
                <Wifi size={15} />
                <BatteryFull size={20} />
              </div>
            </div>
            <StorageNotice />
            <main
              ref={scrollRef}
              className={`app-main ${map ? 'map-main' : ''} ${onboarding ? 'onboarding-main' : ''}`}
              id="app-scroll"
              tabIndex={-1}
              aria-label="メインコンテンツ"
            >
              {children}
            </main>
            {!onboarding && <BottomNavigation />}
            {onboarding && (
              <div
                className={`onboarding-indicator ${welcome ? 'light' : ''}`}
                aria-hidden="true"
              />
            )}
            <div id="overlay-root" />
            <div className={`toast ${message ? 'visible' : ''}`} role="status" aria-live="polite">
              {message && (
                <>
                  <Check size={16} />
                  {message}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="prototype-caption">
        「いつか」を、今度の休日に。<span>PRD v0.2 · UI PROTOTYPE</span>
      </p>
    </div>
  )
}
