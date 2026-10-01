import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { groupStations } from '../domain/stationClusters'
import 'leaflet/dist/leaflet.css'
import type { Bounds, RealMapState, RealStation } from '../domain/realStations'
import { addVectorBasemap, type MapLoadState } from './VectorBasemap'
import type { LocationFix } from '../domain/nearbyStations'

type Props = {
  stations: readonly RealStation[]
  selected: string | null
  view: Pick<RealMapState, 'center' | 'zoom'>
  fit: { bounds: Bounds; key: number } | null
  location?: LocationFix
  onCluster: (stations: RealStation[]) => void
  onSelect: (station: RealStation) => void
  onFitComplete: () => void
  onMove: (view: Pick<RealMapState, 'center' | 'zoom'>, bounds: Bounds) => void
}
export function RealRentalMap(props: Props) {
  const [viewport, setViewport] = useState<{ bounds: Bounds; zoom: number } | null>(null)
  const [loadState, setLoadState] = useState<MapLoadState>('loading')
  const basemap = useRef<ReturnType<typeof addVectorBasemap> | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const positionLayer = useRef<L.LayerGroup | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  useEffect(() => {
    if (!container.current) return
    const initial = callbacks.current
    const instance = L.map(container.current, {
      center: initial.view.center,
      zoom: initial.view.zoom,
      minZoom: 3,
      maxZoom: 18,
      maxBounds: [
        [20, 122],
        [46, 154],
      ],
      maxBoundsViscosity: 1,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false, // Avoid trapping page scrolling; touch pinch and +/- remain available.
    })
    map.current = instance
    basemap.current = addVectorBasemap(instance, setLoadState)
    markers.current = L.layerGroup().addTo(instance)
    positionLayer.current = L.layerGroup().addTo(instance)
    L.control
      .zoom({ position: 'topright', zoomInTitle: '地図を拡大', zoomOutTitle: '地図を縮小' })
      .addTo(instance)
    const moved = () => {
      const center = instance.getCenter(),
        bounds = instance.getBounds()
      setViewport({
        zoom: instance.getZoom(),
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
      })
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
    const observer = new ResizeObserver(() => {
      instance.invalidateSize({ pan: true, animate: false })
    })
    observer.observe(container.current)
    // Initial bounds are reported without changing the active search range.
    moved()
    return () => {
      observer.disconnect()
      basemap.current?.remove()
      basemap.current = null
      instance.remove()
      map.current = null
      markers.current = null
      positionLayer.current = null
    }
  }, [])
  useEffect(() => {
    const layer = positionLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!props.location) return
    const { lat, lng, accuracy } = props.location
    L.circle([lat, lng], {
      radius: accuracy,
      color: '#3785da',
      weight: 1,
      fillColor: '#6daafa',
      fillOpacity: 0.14,
      interactive: false,
    }).addTo(layer)
    const dot = document.createElement('span')
    dot.className = 'real-current-location'
    dot.setAttribute('role', 'img')
    dot.setAttribute('aria-label', '取得した現在地')
    L.marker([lat, lng], {
      keyboard: false,
      interactive: false,
      zIndexOffset: 1500,
      icon: L.divIcon({
        html: dot,
        className: 'real-location-shell',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(layer)
  }, [props.location])
  useEffect(() => {
    const group = markers.current
    if (!group || !viewport) return
    group.clearLayers()
    for (const item of groupStations(props.stations, viewport.zoom, viewport.bounds)) {
      if (item.stations.length > 1) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'real-map-cluster'
        button.textContent = String(item.stations.length)
        button.dataset.stationCount = String(item.stations.length)
        button.setAttribute(
          'aria-label',
          `${item.stations.length}件の拠点を${viewport.zoom >= 18 ? '一覧で見る' : '拡大して見る'}`,
        )
        L.DomEvent.disableClickPropagation(button)
        button.addEventListener('click', () => {
          if (viewport.zoom >= 18) callbacks.current.onCluster(item.stations)
          else
            map.current?.setView([item.latitude, item.longitude], Math.min(18, viewport.zoom + 2), {
              animate: false,
            })
        })
        L.marker([item.latitude, item.longitude], {
          keyboard: false,
          icon: L.divIcon({
            html: button,
            className: 'real-cluster-shell',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
        }).addTo(group)
        continue
      }
      const station = item.stations[0]
      const button = document.createElement('button')
      button.className = `real-map-pin ${station.type === 'カーシェア' ? 'sharing' : 'rental'} ${props.selected === station.id ? 'selected' : ''}`
      button.type = 'button'
      button.setAttribute('aria-label', `${station.name}・${station.type}の詳細カード`)
      button.setAttribute('aria-pressed', String(props.selected === station.id))
      button.dataset.stationCount = '1'
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
  }, [props.stations, props.selected, viewport])
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
        aria-label="実地図。指で移動、2本指で拡大縮小"
      />
      {loadState === 'partial' && (
        <span className="real-map-partial">背景地図がない区画を含みます</span>
      )}
      {loadState !== 'ready' && loadState !== 'partial' && (
        <div className="real-map-status" role="status">
          {loadState === 'loading' ? (
            '地図を読み込んでいます…'
          ) : loadState === 'missing' ? (
            'この範囲の背景地図データがありません。拠点の一覧は利用できます。'
          ) : (
            <>
              <span>地図を読み込めません。一覧は利用できます。</span>
              <button className="text-button" onClick={() => basemap.current?.retry()}>
                地図を再読み込み
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
