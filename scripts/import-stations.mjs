import { readFile, writeFile, rename } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const allowedTags =
  /^(amenity|name|name:ja|brand|branch|operator|opening_hours|check_date|addr:(city|province|full|suburb|quarter|neighbourhood|street|housenumber|block_number))$/

/** Reject partial/error responses before replacing the last usable snapshot. No network calls. */
export function validateSnapshot(raw, previousCount = 0) {
  if (raw.remark || !raw.osm3s?.timestamp_osm_base || !raw.osm3s?.copyright?.includes('ODbL'))
    throw new Error('Incomplete response or missing provenance')
  if (!Number.isFinite(Date.parse(raw.osm3s.timestamp_osm_base))) throw new Error('Invalid date')
  if (!Array.isArray(raw.elements) || raw.elements.length < 2000 || raw.elements.length > 20000)
    throw new Error('Unexpected nationwide count; review source before importing')
  if (previousCount && raw.elements.length < previousCount * 0.8)
    throw new Error('More than 20% fewer records; investigate before replacing')
  const ids = new Set()
  const elements = raw.elements.map((item) => {
    const point = item.type === 'node' ? item : item.center
    const id = `${item.type}-${item.id}`
    if (
      !['node', 'way', 'relation'].includes(item.type) ||
      !Number.isSafeInteger(item.id) ||
      item.id <= 0 ||
      ids.has(id) ||
      !Number.isFinite(point?.lat) ||
      !Number.isFinite(point?.lon) ||
      point.lat < 20 ||
      point.lat > 46 ||
      point.lon < 122 ||
      point.lon > 154 ||
      !['car_rental', 'car_sharing'].includes(item.tags?.amenity)
    )
      throw new Error(`Invalid or duplicate station: ${id}`)
    ids.add(id)
    const tags = Object.fromEntries(
      Object.entries(item.tags).filter(
        ([key, value]) =>
          allowedTags.test(key) && typeof value === 'string' && value.length <= 1000,
      ),
    )
    return {
      type: item.type,
      id: item.id,
      ...(item.type === 'node'
        ? { lat: point.lat, lon: point.lon }
        : { center: { lat: point.lat, lon: point.lon } }),
      tags,
    }
  })
  return { ...raw, elements, generator: 'Drive+ OSM snapshot: relevant tag subset', version: 0.6 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, retrievedAt] = process.argv.slice(2)
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(retrievedAt || ''))
    throw new Error('Usage: node scripts/import-stations.mjs downloaded.json YYYY-MM-DD')
  const text = await readFile(input, 'utf8')
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Snapshot exceeds size limit')
  const target = new URL('../src/data/japan-car-stations.osm.json', import.meta.url)
  const previous = await readFile(target, 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') return { elements: [] }
      throw error
    })
  const snapshot = validateSnapshot(JSON.parse(text), previous.elements.length)
  snapshot.retrievedAt = retrievedAt
  snapshot.query =
    'area["ISO3166-1"="JP"]["admin_level"="2"]; nwr["amenity"~"^(car_rental|car_sharing)$"](area); out center;'
  snapshot.source = 'https://overpass-api.de/api/interpreter'
  snapshot.scope = 'Japan administrative area; community registrations, not complete coverage'
  const output = JSON.stringify(snapshot, null, 2) + '\n'
  const temporary = new URL('../src/data/japan-car-stations.osm.json.tmp', import.meta.url)
  await writeFile(temporary, output)
  await rename(temporary, target)
  console.log(`Imported ${snapshot.elements.length} stations; ${Buffer.byteLength(output)} bytes`)
}
