import L from 'leaflet'
import type { FeatureCollection, Geometry, MultiLineString, Position } from 'geojson'
import data from '../data/kyoto-basemap.geo.json'
import meta from '../data/kyoto-basemap.meta.json'

type Properties = Record<string, string>
const features = (data as unknown as FeatureCollection<Geometry, Properties>).features
export const kyotoMapBounds = L.latLngBounds(
  [meta.bounds.south, meta.bounds.west],
  [meta.bounds.north, meta.bounds.east],
)
const majorRoads = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary'])
const stationNames = new Set([
  '京都',
  '二条',
  '烏丸',
  '四条',
  '烏丸御池',
  '三条',
  '三条京阪',
  '京都市役所前',
  '清水五条',
  '七条',
  '五条',
  '丹波口',
  '梅小路京都西',
  '京都河原町',
])
const roadNames = new Set([
  '四条通',
  '五条通',
  '御池通',
  '烏丸通',
  '堀川通',
  '河原町通',
  '七条通',
  '丸太町通',
])

/** Bundled OSM geometry rendered locally. No tiles, GPS or runtime data service. */
export function addKyotoBasemap(map: L.Map) {
  const renderer = L.canvas({ padding: 0.2, tolerance: 0 })
  const layers: L.Layer[] = []
  const roads: {
    layer: L.GeoJSON
    base: number
    edge: boolean
    minor: boolean
    opacity: number
  }[] = []
  const groups = new Map<string, Position[][]>()
  const addLines = (key: string, lines: Position[][]) => {
    const group = groups.get(key) ?? []
    group.push(...lines)
    groups.set(key, group)
  }
  const areas = features.filter(
    (f) => ['Polygon', 'MultiPolygon'].includes(f.geometry.type) && !f.properties.highway,
  )
  layers.push(
    L.geoJSON({ type: 'FeatureCollection', features: areas } as FeatureCollection, {
      interactive: false,
      style: (feature) => ({
        renderer,
        stroke: false,
        fillColor:
          feature?.properties.natural === 'water' || feature?.properties.waterway
            ? '#add2dd'
            : '#c8dfc7',
        fillOpacity: 1,
      }),
    }).addTo(map),
  )
  for (const f of features) {
    const p = f.properties
    const lines =
      f.geometry.type === 'LineString'
        ? [f.geometry.coordinates]
        : f.geometry.type === 'MultiLineString'
          ? f.geometry.coordinates
          : null
    if (!lines) continue
    if (['river', 'canal'].includes(p.waterway) && !p.tunnel) addLines(p.waterway, lines)
    if (p.railway === 'rail') addLines('rail', lines)
    if (p.highway) {
      const road = p.highway.replace(/_link$/, '')
      const rank = majorRoads.has(road) ? 'major' : road === 'service' ? 'service' : 'street'
      addLines(
        `${rank}:${p.bridge && p.bridge !== 'no' ? 'bridge' : p.tunnel && p.tunnel !== 'no' ? 'tunnel' : 'ground'}`,
        lines,
      )
    }
  }
  // River centerlines use a cartographic width, not a measured bank boundary.
  const waterways: { layer: L.GeoJSON; base: number }[] = []
  for (const kind of ['river', 'canal']) {
    const coordinates = groups.get(kind)
    if (!coordinates) continue
    const layer = L.geoJSON({ type: 'MultiLineString', coordinates } as MultiLineString, {
      interactive: false,
      style: { renderer, color: '#add2dd', opacity: 1, lineCap: 'round' },
    }).addTo(map)
    layers.push(layer)
    waterways.push({ layer, base: kind === 'river' ? 13 : 4 })
  }
  // Surface roads are drawn in groups, avoiding thousands of interactive DOM paths.
  for (const level of ['tunnel', 'ground', 'bridge']) {
    for (const edge of [true, false]) {
      for (const [kind, base] of [
        ['service', 2],
        ['street', 3.5],
        ['major', 7],
      ] as const) {
        const coordinates = groups.get(`${kind}:${level}`)
        if (!coordinates) continue
        const layer = L.geoJSON({ type: 'MultiLineString', coordinates } as MultiLineString, {
          interactive: false,
          style: {
            renderer,
            color: edge ? '#c8d3cb' : '#ffffff',
            opacity: level === 'tunnel' ? 0.5 : 1,
            dashArray: level === 'tunnel' ? '4 5' : undefined,
            lineCap: 'round',
            lineJoin: 'round',
          },
        }).addTo(map)
        layers.push(layer)
        roads.push({
          layer,
          base,
          edge,
          minor: kind === 'service',
          opacity: level === 'tunnel' ? 0.5 : 1,
        })
      }
    }
  }
  if (groups.has('rail'))
    layers.push(
      L.geoJSON({ type: 'MultiLineString', coordinates: groups.get('rail')! } as MultiLineString, {
        interactive: false,
        style: { renderer, color: '#94aaa3', weight: 1.5, dashArray: '3 5', opacity: 0.65 },
      }).addTo(map),
    )

  const labels = L.layerGroup().addTo(map)
  layers.push(labels)
  const update = () => {
    const zoom = map.getZoom()
    const scale = Math.pow(1.5, zoom - 15)
    for (const road of roads)
      road.layer.setStyle({
        weight: Math.max(0.7, road.base * scale) + (road.edge ? 1.4 : 0),
        opacity: road.minor && zoom < 15 ? 0 : road.opacity,
      })
    for (const water of waterways)
      water.layer.setStyle({ weight: water.base * Math.pow(1.8, zoom - 15) })
    labels.clearLayers()
    const occupied: L.Bounds[] = []
    const used = new Set<string>()
    const visible = map.getBounds()
    const candidates = features
      .flatMap((f) => {
        const name = f.properties['name:ja'] || f.properties.name
        if (!name) return []
        if (f.geometry.type === 'Point' && stationNames.has(name))
          return [{ name: `${name}駅`, point: f.geometry.coordinates, kind: 'station' }]
        if (zoom >= 14 && f.geometry.type === 'LineString' && roadNames.has(name))
          return [
            {
              name,
              point: f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)],
              kind: 'road',
            },
          ]
        return []
      })
      .filter((c) => visible.contains([c.point[1], c.point[0]]))
    candidates.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'station' ? -1 : 1) ||
        L.latLng(a.point[1], a.point[0]).distanceTo(map.getCenter()) -
          L.latLng(b.point[1], b.point[0]).distanceTo(map.getCenter()),
    )
    for (const c of candidates) {
      if (used.has(c.name)) continue
      const position = L.latLng(c.point[1], c.point[0])
      const pixel = map.latLngToContainerPoint(position)
      const box = L.bounds(pixel.subtract([42, 15]), pixel.add([42, 15]))
      if (occupied.some((b) => b.intersects(box))) continue
      const text = document.createElement('span')
      text.textContent = c.name
      text.className = `kyoto-map-label ${c.kind}`
      L.marker(position, {
        icon: L.divIcon({
          html: text,
          className: 'kyoto-label-shell',
          iconSize: [90, 20],
          iconAnchor: [45, -5],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: -2000,
      }).addTo(labels)
      occupied.push(box)
      used.add(c.name)
    }
  }
  map.on('zoomend moveend', update)
  update()
  return () => {
    map.off('zoomend moveend', update)
    for (const layer of layers) layer.remove()
    renderer.remove()
  }
}
