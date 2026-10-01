// Offline conversion only: no API requests, no application/user data.
// Input is osmtogeojson 3.0.0-beta.5's output; see docs/CAR_SEARCH.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [osmPath, geoPath, queryPath] = process.argv.slice(2)
if (!osmPath || !geoPath || !queryPath)
  throw new Error('Expected OSM JSON, GeoJSON and query paths')
const raw = readFileSync(osmPath)
const osm = JSON.parse(raw)
if (osm.remark || !osm.osm3s?.timestamp_osm_base) throw new Error('Incomplete Overpass response')
const geo = JSON.parse(readFileSync(geoPath, 'utf8'))
const keys = [
  'name',
  'name:ja',
  'highway',
  'railway',
  'natural',
  'waterway',
  'leisure',
  'landuse',
  'bridge',
  'tunnel',
]
const features = geo.features
  .filter((feature) => {
    const p = feature.properties
    if (p['@tainted']) throw new Error(`Incomplete geometry: ${feature.id}`)
    return (
      /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$/.test(
        p.highway || '',
      ) ||
      p.railway === 'rail' ||
      p.railway === 'station' ||
      p.natural === 'water' ||
      ['riverbank', 'river', 'canal'].includes(p.waterway) ||
      p.leisure === 'park' ||
      p.landuse === 'forest'
    )
  })
  .map((feature) => ({
    type: 'Feature',
    id: feature.id,
    properties: Object.fromEntries(
      keys.filter((key) => feature.properties[key]).map((key) => [key, feature.properties[key]]),
    ),
    // Preserve source geometry, including polygon holes and bridge/tunnel tags.
    geometry: feature.geometry,
  }))
const meta = {
  title: '京都中心部・道路を見やすくした地図',
  bounds: { south: 34.965, west: 135.72, north: 35.04, east: 135.8 },
  source: 'https://overpass-api.de/api/interpreter',
  dataTimestamp: osm.osm3s.timestamp_osm_base,
  sourceTimestamps: osm.sourceTimestamps,
  retrievedAt: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors',
  license: 'https://opendatacommons.org/licenses/odbl/1-0/',
  query: readFileSync(queryPath, 'utf8'),
  rawSha256: createHash('sha256').update(raw).digest('hex'),
  converter: 'osmtogeojson@3.0.0-beta.5; scripts/prepare-kyoto-basemap.mjs',
  featureCount: features.length,
  changes:
    'Selected roads, above-ground railways, water, parks/forest and stations; retained source IDs and geometry; removed unused tags. Display is a simplified map, not navigation.',
}
if (features.length < 1000 || features.length > 100000) throw new Error('Unexpected data volume')
writeFileSync(
  'src/data/kyoto-basemap.geo.json',
  JSON.stringify({ type: 'FeatureCollection', ...meta, features }) + '\n',
)
writeFileSync('src/data/kyoto-basemap.meta.json', JSON.stringify(meta, null, 2) + '\n')
console.log(`Prepared ${features.length} features (ODbL 1.0)`)
