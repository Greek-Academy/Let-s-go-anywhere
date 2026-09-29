import snapshot from '../data/kyoto-car-stations.osm.json' with { type: 'json' }
import umeda from '../data/umeda-car-stations.osm.json' with { type: 'json' }
import kusatsu from '../data/kusatsu-car-stations.osm.json' with { type: 'json' }
import type { StationType } from '../data/types'
import type { CarProviderId } from '../data/carProviders'

export const stationSnapshot = snapshot
export const stationRegions = [
  { name: '京都中心部', locality: '京都市', retrievedAt: '2026-09-29', snapshot },
  { name: '大阪・梅田', locality: '大阪市北区', retrievedAt: '2026-09-30', snapshot: umeda },
  { name: '滋賀・草津', locality: '滋賀県草津市', retrievedAt: '2026-09-30', snapshot: kusatsu },
]
export const stationLicense = 'https://opendatacommons.org/licenses/odbl/1-0/'
export type Bounds = { south: number; west: number; north: number; east: number }
export const pilotBounds: Bounds = { south: 34.974, west: 135.738, north: 35.025, east: 135.781 }
export const pilotAreas = [
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
    const provider = base.includes('タイムズ')
      ? type === 'カーシェア'
        ? 'タイムズカー'
        : 'タイムズレンタカー'
      : base.includes('日産')
        ? '日産レンタカー'
        : tags.brand || base
    const officialSearchProvider =
      type === 'カーシェア' && provider === 'タイムズカー'
        ? 'times'
        : provider === 'トヨタレンタカー'
          ? 'toyota'
          : provider === 'ニッポンレンタカー'
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
      locality: region.locality,
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
  return realStations.filter(
    (station) =>
      !state.unsupported &&
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
