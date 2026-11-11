import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

// Import data only; never execute the upstream JavaScript.
const source = 'https://maps.gsi.go.jp/js/muni.js'
const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
if (!response.ok) throw new Error('Municipality download failed')
const text = await response.text()
if (text.length > 500_000) throw new Error('Unexpected municipality data size')
const municipalities = {}
for (const match of text.matchAll(/GSI\.MUNI_ARRAY\["(\d{4,5})"\]\s*=\s*'([^'\r\n]+)';/g)) {
  const [prefCode, prefecture, code, municipality, ...extra] = match[2].split(',')
  if (
    code !== match[1] ||
    extra.length ||
    !/^(?:[1-9]|[1-3]\d|4[0-7])$/.test(prefCode) ||
    !/[都道府県]$/u.test(prefecture) ||
    !/[市区町村]$/u.test(municipality)
  )
    throw new Error('Unexpected municipality row')
  const key = code.padStart(5, '0')
  if (municipalities[key]) throw new Error('Duplicate municipality code')
  municipalities[key] = `${prefecture},${municipality}`
}
if (Object.keys(municipalities).length < 1800 || Object.keys(municipalities).length > 2500)
  throw new Error('Unexpected municipality count')
const data = {
  source,
  attribution: '国土地理院の市区町村コード表を加工して作成（コードを5桁に統一）',
  terms: 'https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html',
  retrievedAt: new Date().toISOString().slice(0, 10),
  sourceSha256: createHash('sha256').update(text).digest('hex'),
  municipalities,
}
await writeFile(
  new URL('../tools/spot-comparison/gsi-municipalities.json', import.meta.url),
  `${JSON.stringify(data, null, 2)}\n`,
)
console.log(`Imported ${Object.keys(municipalities).length} municipality codes`)
