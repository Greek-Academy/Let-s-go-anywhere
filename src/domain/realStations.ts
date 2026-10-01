import snapshot from '../data/japan-car-stations.osm.json' with { type: 'json' }
import type { StationType } from '../data/types'
import type { CarProviderId } from '../data/carProviders'

type Snapshot = {
  retrievedAt: string
  osm3s: { timestamp_osm_base: string; copyright: string }
  elements: {
    type: string
    id: number
    lat?: number
    lon?: number
    center?: { lat: number; lon: number }
    tags: Record<string, string>
  }[]
}
export const stationSnapshot: Snapshot = snapshot
export const stationRegions = [
  {
    name: '全国の登録拠点',
    locality: '所在地の詳細は未確認',
    retrievedAt: snapshot.retrievedAt,
    snapshot: stationSnapshot,
  },
]
export const stationLicense = 'https://opendatacommons.org/licenses/odbl/1-0/'
export type Bounds = { south: number; west: number; north: number; east: number }
export const pilotBounds: Bounds = { south: 34.974, west: 135.738, north: 35.025, east: 135.781 }
export const nationalBounds: Bounds = { south: 24, west: 122.5, north: 46, east: 146 }
export const pilotAreas = [
  { name: '全国', aliases: ['日本', '全国の登録拠点'], bounds: nationalBounds },
  {
    name: '浜松町',
    aliases: ['浜松町駅', '大門', '大門駅'],
    bounds: { south: 35.632, west: 139.73, north: 35.68, east: 139.784 },
  },
  {
    name: '東京駅',
    aliases: ['東京', '東京都', '丸の内'],
    bounds: { south: 35.66, west: 139.735, north: 35.697, east: 139.785 },
  },
  {
    name: '札幌',
    aliases: ['札幌駅', '札幌市'],
    bounds: { south: 43.035, west: 141.32, north: 43.095, east: 141.385 },
  },
  {
    name: '仙台',
    aliases: ['仙台駅', '仙台市'],
    bounds: { south: 38.24, west: 140.855, north: 38.285, east: 140.9 },
  },
  {
    name: '名古屋',
    aliases: ['名古屋駅', '名古屋市'],
    bounds: { south: 35.145, west: 136.86, north: 35.195, east: 136.92 },
  },
  {
    name: '広島',
    aliases: ['広島駅', '広島市'],
    bounds: { south: 34.365, west: 132.435, north: 34.415, east: 132.495 },
  },
  {
    name: '福岡・博多',
    aliases: ['福岡', '博多', '博多駅', '福岡市'],
    bounds: { south: 33.57, west: 130.385, north: 33.625, east: 130.45 },
  },
  {
    name: '那覇',
    aliases: ['那覇市', '那覇空港', '沖縄'],
    bounds: { south: 26.18, west: 127.645, north: 26.245, east: 127.725 },
  },
  {
    name: '新宿・中野',
    aliases: ['新宿', '新宿駅', '新宿区', '中野', '中野区', '東中野', '大久保', '西新宿'],
    bounds: { south: 35.685, west: 139.665, north: 35.72, east: 139.715 },
  },
  {
    name: '大阪・梅田',
    aliases: ['大阪', '梅田', '大阪駅', '大阪梅田', '梅田駅'],
    bounds: { south: 34.695, west: 135.49, north: 34.71, east: 135.505 },
  },
  {
    name: '滋賀・草津',
    aliases: ['滋賀', '草津', '草津駅', '滋賀県草津市'],
    bounds: { south: 34.993, west: 135.945, north: 35.035, east: 135.978 },
  },
  { name: '京都中心部', aliases: ['京都', '京都府', '京都市'], bounds: pilotBounds },
  {
    name: '京都駅',
    aliases: ['京都駅周辺'],
    bounds: { south: 34.978, west: 135.75, north: 34.99, east: 135.768 },
  },
  {
    name: '四条烏丸',
    aliases: ['烏丸', '四条', '烏丸駅', '四条駅'],
    bounds: { south: 34.998, west: 135.746, north: 35.009, east: 135.766 },
  },
  {
    name: '烏丸御池',
    aliases: ['烏丸御池駅'],
    bounds: { south: 35.005, west: 135.75, north: 35.017, east: 135.766 },
  },
  {
    name: '三条京阪',
    aliases: ['三条', '三条駅', '三条京阪駅'],
    bounds: { south: 35.002, west: 135.767, north: 35.015, east: 135.781 },
  },
]
export function findPilotArea(query: string) {
  const value = query.normalize('NFKC').replace(/\s/g, '')
  return pilotAreas.find((area) => [area.name, ...area.aliases].includes(value))
}
export interface RealStation {
  id: string
  name: string
  type: Exclude<StationType, 'すべて'>
  provider: string
  officialSearchProvider: CarProviderId | null
  latitude: number
  longitude: number
  sourceUrl: string
  sourceHours: string | null
  sourceCheckDate: string | null
  region: string
  locality: string
  retrievedAt: string
}
/** A community-data snapshot, never an approved/operating/available station catalog. */
export const realStations: readonly RealStation[] = stationRegions.flatMap((region) =>
  region.snapshot.elements.map((element) => {
    const tags: Record<string, string | undefined> = element.tags
    const point = 'lat' in element ? { lat: element.lat, lon: element.lon } : element.center
    if (
      !point ||
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lon) ||
      !['car_rental', 'car_sharing'].includes(tags.amenity ?? '') ||
      !['node', 'way', 'relation'].includes(element.type) ||
      !Number.isSafeInteger(element.id)
    )
      throw new Error('Invalid station snapshot')
    const type = tags.amenity === 'car_sharing' ? 'カーシェア' : 'レンタカー'
    const base = tags['name:ja'] || tags.name || tags.brand || '名称未登録の拠点'
    const name = tags.branch ? `${base} ${tags.branch}` : base
    const brandText = `${tags.brand || ''} ${base}`
    const provider =
      brandText.includes('タイムズ') || /times/i.test(brandText)
        ? type === 'カーシェア'
          ? 'タイムズカー'
          : 'タイムズレンタカー'
        : brandText.includes('トヨタ') || /toyota/i.test(brandText)
          ? type === 'カーシェア'
            ? 'トヨタ（カーシェア）'
            : 'トヨタレンタカー'
          : brandText.includes('ニッポン') || /nippon/i.test(brandText)
            ? 'ニッポンレンタカー'
            : brandText.includes('オリックス') || /orix/i.test(brandText)
              ? type === 'カーシェア'
                ? 'オリックスカーシェア'
                : 'オリックスレンタカー'
              : brandText.includes('日産') || /nissan/i.test(brandText)
                ? '日産レンタカー'
                : tags.brand || base
    const officialSearchProvider =
      type === 'カーシェア' && provider === 'タイムズカー'
        ? 'times'
        : type === 'レンタカー' && provider === 'トヨタレンタカー'
          ? 'toyota'
          : type === 'レンタカー' && provider === 'ニッポンレンタカー'
            ? 'nippon'
            : null
    return {
      id: `osm-${element.type}-${element.id}`,
      name,
      provider,
      type,
      officialSearchProvider,
      latitude: point.lat!,
      longitude: point.lon!,
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      sourceHours: tags.opening_hours || null,
      sourceCheckDate: tags.check_date || null,
      region: region.name,
      locality:
        tags['addr:full'] ||
        [
          tags['addr:province'],
          tags['addr:city'],
          tags['addr:suburb'],
          tags['addr:quarter'],
          tags['addr:neighbourhood'],
          tags['addr:street'],
          tags['addr:block_number'],
          tags['addr:housenumber'],
        ]
          .filter(Boolean)
          .join('') ||
        region.locality,
      retrievedAt: region.retrievedAt,
    }
  }),
)
export function insideBounds(station: RealStation, bounds: Bounds) {
  return (
    station.latitude >= bounds.south &&
    station.latitude <= bounds.north &&
    station.longitude >= bounds.west &&
    station.longitude <= bounds.east
  )
}
export interface RealMapState {
  mode: 'map' | 'list'
  type: StationType
  providers: string[]
  query: string
  appliedArea: string
  unsupported: boolean
  bounds: Bounds
  center: { lat: number; lng: number }
  zoom: number
  selected: string | null
}
export const createRealMapState = (): RealMapState => ({
  mode: 'map',
  type: 'すべて',
  providers: [],
  query: '',
  appliedArea: '京都中心部',
  unsupported: false,
  bounds: { ...pilotBounds },
  center: { lat: 35.0, lng: 135.76 },
  zoom: 13,
  selected: null,
})
export function filterRealStations(state: RealMapState) {
  const matching =
    state.query && state.appliedArea === state.query && !findPilotArea(state.query)
      ? new Set(searchStationArea(state.query)?.matches || [])
      : null
  return realStations.filter(
    (station) =>
      !state.unsupported &&
      (!matching || matching.has(station.id)) &&
      (state.type === 'すべて' || station.type === state.type) &&
      (!state.providers.length || state.providers.includes(station.provider)) &&
      insideBounds(station, state.bounds),
  )
}
/** Only bundled IDs and fixed destinations are accepted; no free-text external URLs. */
export function realStationDestination(id: string, target: 'source' | 'map') {
  const station = realStations.find((item) => item.id === id)
  if (!station) throw new Error('Unknown station')
  if (target === 'source') return { url: station.sourceUrl, host: 'www.openstreetmap.org' }
  if (target !== 'map') throw new Error('Invalid destination')
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', `${station.latitude},${station.longitude}`)
  return { url: url.href, host: url.hostname }
}

/** Named presets first, then names/addresses actually present in the bundled catalog.
 * This is local catalog search, not an address geocoder. */
export function searchStationArea(
  query: string,
): { name: string; bounds: Bounds; matches?: string[] } | undefined {
  const preset = findPilotArea(query)
  if (preset) return preset
  const value = query.normalize('NFKC').replace(/\s/g, '').toLowerCase()
  if (!value) return undefined
  const matches = realStations.filter((station) =>
    `${station.name}${station.locality}`
      .normalize('NFKC')
      .replace(/\s/g, '')
      .toLowerCase()
      .includes(value),
  )
  if (!matches.length) return undefined
  return {
    name: query.trim(),
    matches: matches.map((station) => station.id),
    bounds: {
      south: Math.min(...matches.map((s) => s.latitude)) - 0.008,
      north: Math.max(...matches.map((s) => s.latitude)) + 0.008,
      west: Math.min(...matches.map((s) => s.longitude)) - 0.01,
      east: Math.max(...matches.map((s) => s.longitude)) + 0.01,
    },
  }
}
