import L from 'leaflet'
import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { mapTileCache, tileUrl, MissingTileError } from '../domain/mapTiles'

/** Only roads, water, railway and a small selection of names. This is not routing data. */
export function drawVectorTile(canvas: HTMLCanvasElement, data: ArrayBuffer, zoom: number) {
  const tile = new VectorTile(new PbfReader(data))
  if (!Object.keys(tile.layers).length) throw new Error('Invalid vector tile')
  const ctx = canvas.getContext('2d')!
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = canvas.height = 512 * ratio
  ctx.scale(ratio, ratio)
  ctx.fillStyle = '#e4ebe7'
  ctx.fillRect(0, 0, 512, 512)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const features = (name: string) => {
    const layer = tile.layers[name]
    return layer ? Array.from({ length: layer.length }, (_, i) => layer.feature(i)) : []
  }
  const path = (feature: VectorTileFeature) => {
    const scale = 512 / feature.extent
    ctx.beginPath()
    for (const ring of feature.loadGeometry()) {
      ring.forEach((p, i) =>
        i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale),
      )
      if (feature.type === 3) ctx.closePath()
    }
  }
  for (const feature of features('waterarea')) {
    path(feature)
    ctx.fillStyle = '#add2dd'
    ctx.fill('evenodd')
  }
  for (const feature of features('coastline')) {
    path(feature)
    ctx.strokeStyle = '#8fb4b3'
    ctx.lineWidth = zoom < 9 ? 2 : 1.2
    ctx.stroke()
  }
  for (const feature of features('river')) {
    path(feature)
    ctx.strokeStyle = '#add2dd'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  const roads = features('road').filter((f) =>
    [2701, 2702, 2703, 2711, 2712, 2713, 2721, 2722, 2723].includes(Number(f.properties.ftCode)),
  )
  const width = (f: VectorTileFeature) => {
    const major = [0, 1, 3].includes(Number(f.properties.rdCtg))
    return (major ? 5.5 : 2.8) * Math.max(0.65, Math.min(2.2, 2 ** ((zoom - 14) / 2)))
  }
  // Draw all casings first so road junctions stay continuous.
  for (const casing of [true, false])
    for (const f of roads) {
      path(f)
      ctx.strokeStyle = casing ? '#c8d3cb' : '#fff'
      ctx.lineWidth = width(f) + (casing ? 1.6 : 0)
      ctx.globalAlpha = [2, 3].includes(Number(f.properties.lvOrder)) ? 0.6 : 1
      ctx.stroke()
    }
  ctx.globalAlpha = 1
  for (const feature of features('railway')) {
    path(feature)
    ctx.strokeStyle = '#9baea4'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = '#f5f8f5'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
  }
  const occupied: { x: number; y: number; w: number }[] = []
  const labels = features('label')
    .filter((f) => [110, 422, 411, 532].includes(Number(f.properties.annoCtg)))
    .sort((a, b) => Number(b.properties.annoCtg === 422) - Number(a.properties.annoCtg === 422))
  for (const f of labels) {
    const text = String(f.properties.knj ?? '')
    if (!text || text.length > 18) continue
    const p = f.loadGeometry()[0]?.[0]
    if (!p) continue
    const x = (p.x * 512) / f.extent,
      y = (p.y * 512) / f.extent
    const station = f.properties.annoCtg === 422
    if (!station && zoom < 14 && f.properties.annoCtg !== 110) continue
    ctx.font = `${station ? '600' : '400'} ${station ? 12 : 11}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(text).width + 12
    // Keep labels away from tile edges to avoid cut text and cross-tile overlaps.
    if (
      x < w / 2 ||
      x > 512 - w / 2 ||
      y < 14 ||
      y > 498 ||
      occupied.some((r) => Math.abs(r.x - x) < (r.w + w) / 2 && Math.abs(r.y - y) < 28)
    )
      continue
    occupied.push({ x, y, w })
    ctx.strokeStyle = '#f5f8f5'
    ctx.lineWidth = 4
    ctx.strokeText(text, x, y)
    ctx.fillStyle = station ? '#436f63' : '#71877c'
    ctx.fillText(text, x, y)
  }
}

export type MapLoadState = 'loading' | 'ready' | 'error' | 'partial' | 'missing'
export function addVectorBasemap(map: L.Map, onState: (state: MapLoadState) => void) {
  const releases = new Map<HTMLElement, () => void>()
  const failed = new Set<HTMLElement>()
  const missing = new Set<HTMLElement>()
  const ready = new Set<HTMLElement>()
  const report = () =>
    onState(failed.size ? 'error' : missing.size ? (ready.size ? 'partial' : 'missing') : 'ready')
  let disposed = false
  class VectorLayer extends L.GridLayer {
    override createTile(coords: L.Coords, done: L.DoneCallback) {
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      const url = tileUrl(coords.x, coords.y, coords.z)
      const lease = mapTileCache.acquire(url)
      let active = true
      releases.set(canvas, () => {
        active = false
        lease.release()
      })
      void lease.promise
        .then((data) => {
          if (!active || disposed) return
          try {
            drawVectorTile(canvas, data, coords.z - 1)
          } catch (error) {
            mapTileCache.invalidate(url)
            throw error
          }
          ready.add(canvas)
          canvas.dataset.mapReady = 'true'
          done(undefined, canvas)
        })
        .catch((error: unknown) => {
          if (!active || disposed) return
          if (error instanceof MissingTileError) {
            missing.add(canvas)
            canvas.dataset.mapMissing = 'true'
            done(undefined, canvas)
            return
          }
          failed.add(canvas)
          onState('error')
          done(error instanceof Error ? error : new Error('Map unavailable'), canvas)
        })
      return canvas
    }
  }
  const layer = new VectorLayer({
    tileSize: 512,
    minZoom: 3,
    bounds: [
      [20, 122],
      [46, 154],
    ],
    minNativeZoom: 5,
    maxNativeZoom: 17,
    maxZoom: 18,
    noWrap: true,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 0,
  })
  layer.on('loading', () => onState('loading'))
  layer.on('load', report)
  layer.on('tileunload', (event: L.TileEvent) => {
    releases.get(event.tile)?.()
    releases.delete(event.tile)
    failed.delete(event.tile)
    missing.delete(event.tile)
    ready.delete(event.tile)
  })
  layer.addTo(map)
  return {
    retry() {
      failed.clear()
      missing.clear()
      ready.clear()
      onState('loading')
      layer.redraw()
    },
    remove() {
      disposed = true
      releases.forEach((release) => release())
      releases.clear()
      layer.remove()
    },
  }
}
