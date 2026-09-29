import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Bounds, RealMapState, RealStation } from '../domain/realStations'
import { pilotBounds } from '../domain/realStations'

export const gsiTiles = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'
type Props = {
  stations: readonly RealStation[]
  selected: string | null
  view: Pick<RealMapState, 'center' | 'zoom'>
  fit: { bounds: Bounds; key: number } | null
  onSelect: (station: RealStation) => void
  onFitComplete: () => void
  onMove: (view: Pick<RealMapState, 'center' | 'zoom'>, bounds: Bounds) => void
}
export function RealRentalMap(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const tiles = useRef<L.TileLayer | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!container.current) return
    const initial = callbacks.current
    const instance = L.map(container.current, {
      center: initial.view.center,
      zoom: initial.view.zoom,
      minZoom: 12,
      maxZoom: 18,
      maxBounds: [
        [pilotBounds.south - 0.02, pilotBounds.west - 0.02],
        [pilotBounds.north + 0.02, pilotBounds.east + 0.02],
      ],
      maxBoundsViscosity: 1,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false, // Avoid trapping page scrolling; touch pinch and +/- remain available.
    })
    map.current = instance
    const layer = L.tileLayer(gsiTiles, {
      minZoom: 12,
      maxZoom: 18,
      updateWhenIdle: true,
      keepBuffer: 0,
    })
    tiles.current = layer
    layer.on('tileerror', () => setFailed(true)).addTo(instance)
    markers.current = L.layerGroup().addTo(instance)
    L.control
      .zoom({ position: 'topright', zoomInTitle: '地図を拡大', zoomOutTitle: '地図を縮小' })
      .addTo(instance)
    const moved = () => {
      const center = instance.getCenter(),
        bounds = instance.getBounds()
      callbacks.current.onMove(
        { center: { lat: center.lat, lng: center.lng }, zoom: instance.getZoom() },
        {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
      )
    }
    instance.on('moveend', moved)
    const observer = new ResizeObserver(() =>
      instance.invalidateSize({ pan: true, animate: false }),
    )
    observer.observe(container.current)
    // Initial bounds are reported without changing the active search range.
    moved()
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      markers.current = null
    }
  }, [])
  useEffect(() => {
    const group = markers.current
    if (!group) return
    group.clearLayers()
    for (const station of props.stations) {
      const button = document.createElement('button')
      button.className = `real-map-pin ${station.type === 'カーシェア' ? 'sharing' : 'rental'} ${props.selected === station.id ? 'selected' : ''}`
      button.type = 'button'
      button.setAttribute('aria-label', `${station.name}・${station.type}の詳細カード`)
      button.setAttribute('aria-pressed', String(props.selected === station.id))
      button.dataset.stationId = station.id
      button.dataset.focusKey = `real-pin:${station.id}`
      // The icon is a CSS background, keeping native WebKit's accessibility
      // hit box limited to the button after Leaflet transforms the marker.
      L.DomEvent.disableClickPropagation(button)
      button.addEventListener('click', () => callbacks.current.onSelect(station))
      const marker = L.marker([station.latitude, station.longitude], {
        icon: L.divIcon({
          html: button,
          className: 'real-marker-shell',
          iconSize: [40, 44],
          iconAnchor: [20, 38],
        }),
        keyboard: false,
        zIndexOffset: props.selected === station.id ? 1000 : 0,
      })
      marker.addTo(group)
    }
  }, [props.stations, props.selected])
  useEffect(() => {
    if (!props.fit || !map.current) return
    const b = props.fit.bounds
    // Wait for the mounted map layout. Cleanup also cancels React StrictMode's
    // trial mount, so a consumed fit cannot be followed by the initial view.
    const frame = requestAnimationFrame(() => {
      map.current?.fitBounds(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        { padding: [28, 30], maxZoom: 16, animate: false },
      )
      callbacks.current.onFitComplete()
    })
    return () => cancelAnimationFrame(frame)
  }, [props.fit])
  return (
    <div className="real-map-surface">
      <div
        ref={container}
        className="real-map-canvas"
        role="region"
        aria-label="京都の実地図。指で移動、2本指で拡大縮小"
      />
      {failed && (
        <div className="real-map-error" role="status">
          <span>地図を読み込めません。一覧からも拠点を確認できます。</span>
          <button
            onClick={() => {
              setFailed(false)
              tiles.current?.redraw()
            }}
          >
            再読み込み
          </button>
        </div>
      )}
    </div>
  )
}
