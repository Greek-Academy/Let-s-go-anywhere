import catalog from '../data/rail-stations.json' with { type: 'json' }
import { prefectures } from '../data/regions.ts'

export interface RailStation {
  id: string
  name: string
  kana: string
  prefecture: string
  lat: number
  lng: number
  lines: string[]
}
export const STATION_RADIUS_METERS = 2000
export const railStations: RailStation[] = catalog.stations.map((row) => {
  const [id, name, kana, prefecture, lat, lng, codes] = row as [
    string,
    string,
    string,
    number,
    number,
    number,
    string[],
  ]
  return {
    id,
    name,
    kana,
    prefecture: prefectures[prefecture - 1],
    lat,
    lng,
    lines: codes.map((code) => (catalog.lines as Record<string, string>)[code]),
  }
})
const byId = new Map(railStations.map((s) => [s.id, s]))
export function railStation(id: unknown): RailStation | null {
  return typeof id === 'string' ? (byId.get(id) ?? null) : null
}
export function stationLabel(station: RailStation): string {
  return `${station.name}駅（${station.prefecture}）`
}
export function stationRegion(station: RailStation): string {
  return `${station.prefecture} ${station.name}駅周辺`
}
export function normalizeStationText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・]/g, '')
    .replace(/駅$/, '')
}
const index = railStations.map((s) => ({
  station: s,
  name: normalizeStationText(s.name),
  kana: normalizeStationText(s.kana),
}))
export function findRailStations(text: string, limit = 20): RailStation[] {
  const query = normalizeStationText(text.trim().slice(0, 80))
  if (!query) return []
  return index
    .flatMap(({ station, name, kana }) => {
      const score =
        name === query || kana === query
          ? 0
          : name.startsWith(query) || kana.startsWith(query)
            ? 1
            : name.includes(query) || kana.includes(query)
              ? 2
              : -1
      return score < 0 ? [] : [{ station, score }]
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.station.kana.localeCompare(b.station.kana, 'ja') ||
        a.station.id.localeCompare(b.station.id),
    )
    .slice(0, limit)
    .map((s) => s.station)
}
