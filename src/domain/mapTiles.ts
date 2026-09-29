/** GSI's 512px vector tiles: Leaflet zoom 15 corresponds to source zoom 14. */
export const tileBase = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/'
export function tileUrl(x: number, y: number, leafletZoom: number) {
  const z = leafletZoom - 1
  if (
    ![x, y, z].every(Number.isInteger) ||
    z < 4 ||
    z > 16 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  )
    throw new Error('Invalid tile coordinates')
  return `${tileBase}${z}/${x}/${y}.pbf`
}
export type TileMetrics = {
  requests: number
  completed: number
  bytes: number
  hits: number
  shared: number
  failed: number
  aborted: number
  cachedBytes: number
  cachedTiles: number
  samples: { bytes: number; milliseconds: number }[]
}
const emptyMetrics = (): TileMetrics => ({
  requests: 0,
  completed: 0,
  bytes: 0,
  hits: 0,
  shared: 0,
  failed: 0,
  aborted: 0,
  cachedBytes: 0,
  cachedTiles: 0,
  samples: [],
})
type Pending = { promise: Promise<ArrayBuffer>; controller: AbortController; users: number }
/** Session-only, bounded LRU. No bulk prefetch, disk storage, location history or analytics. */
export class TileCache {
  private cache = new Map<string, { data: ArrayBuffer; at: number }>()
  private pending = new Map<string, Pending>()
  private listeners = new Set<() => void>()
  private metrics = emptyMetrics()
  constructor(
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private limit = 8 * 1024 * 1024,
    private ttl = 15 * 60_000,
  ) {}
  snapshot = () => this.metrics
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(values: Partial<TileMetrics>) {
    this.metrics = { ...this.metrics, ...values }
    this.listeners.forEach((listener) => listener())
  }
  private cacheSize() {
    return [...this.cache.values()].reduce((size, entry) => size + entry.data.byteLength, 0)
  }
  invalidate(url: string) {
    this.cache.delete(url)
    this.publish({ cachedBytes: this.cacheSize(), cachedTiles: this.cache.size })
  }
  acquire(url: string) {
    if (
      !/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/experimental_bvmap\/\d+\/\d+\/\d+\.pbf$/.test(
        url,
      )
    )
      throw new Error('Unapproved map source')
    const cached = this.cache.get(url)
    if (cached && Date.now() - cached.at < this.ttl) {
      this.cache.delete(url)
      this.cache.set(url, cached)
      this.publish({ hits: this.metrics.hits + 1 })
      return { promise: Promise.resolve(cached.data), release() {} }
    }
    if (cached) this.invalidate(url)
    let job = this.pending.get(url)
    if (job) this.publish({ shared: this.metrics.shared + 1 })
    else {
      const controller = new AbortController()
      const start = performance.now()
      const timer = setTimeout(() => controller.abort(new Error('Map request timed out')), 12_000)
      this.publish({ requests: this.metrics.requests + 1 })
      const promise = this.fetcher(url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Map HTTP ${response.status}`)
          // Read with a size cap, even when Content-Length is absent.
          const reader = response.body?.getReader()
          if (!reader) throw new Error('Missing map data')
          const parts: Uint8Array[] = []
          let size = 0
          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              size += value.byteLength
              if (size > 4 * 1024 * 1024) throw new Error('Map tile too large')
              parts.push(value)
            }
          } catch (error) {
            await reader.cancel()
            throw error
          }
          if (!size) throw new Error('Empty map tile')
          const data = new Uint8Array(size)
          let offset = 0
          for (const part of parts) {
            data.set(part, offset)
            offset += part.byteLength
          }
          if (controller.signal.aborted) throw controller.signal.reason
          while (this.cache.size && this.cacheSize() + size > this.limit)
            this.cache.delete(this.cache.keys().next().value!)
          if (size <= this.limit) this.cache.set(url, { data: data.buffer, at: Date.now() })
          this.publish({
            completed: this.metrics.completed + 1,
            bytes: this.metrics.bytes + size,
            cachedBytes: this.cacheSize(),
            cachedTiles: this.cache.size,
            samples: [
              ...this.metrics.samples.slice(-39),
              { bytes: size, milliseconds: Math.round(performance.now() - start) },
            ],
          })
          return data.buffer
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            this.publish({ aborted: this.metrics.aborted + 1 })
          else this.publish({ failed: this.metrics.failed + 1 })
          throw error
        })
        .finally(() => {
          clearTimeout(timer)
          if (this.pending.get(url)?.controller === controller) this.pending.delete(url)
        })
      job = { promise, controller, users: 0 }
      this.pending.set(url, job)
    }
    job.users++
    const current = job
    let released = false
    return {
      promise: current.promise,
      release: () => {
        if (released) return
        released = true
        if (--current.users === 0 && this.pending.get(url) === current) {
          this.pending.delete(url)
          current.controller.abort()
        }
      },
    }
  }
}
export const mapTileCache = new TileCache()
