import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateSnapshot } from './import-stations.mjs'

const source = JSON.parse(
  readFileSync(new URL('../src/data/japan-car-stations.osm.json', import.meta.url)),
)
test('valid national snapshot retains source identity and removes unrelated contact tags', () => {
  const raw = structuredClone(source)
  raw.elements[0].tags['contact:email'] = 'sample@example.invalid'
  const result = validateSnapshot(raw, source.elements.length)
  assert.equal(result.elements.length, source.elements.length)
  assert.equal(result.elements[0].id, source.elements[0].id)
  assert.equal(result.elements[0].tags['contact:email'], undefined)
  assert.deepEqual(result.osm3s, source.osm3s)
})
test('partial/error, unexpected decline, duplicate IDs and invalid coordinates are rejected', () => {
  assert.throws(() => validateSnapshot({ ...source, remark: 'runtime timeout: partial data' }))
  assert.throws(() => validateSnapshot({ ...source, elements: [] }))
  assert.throws(() => validateSnapshot(source, 5000))
  assert.throws(() =>
    validateSnapshot({ ...source, elements: [...source.elements, source.elements[0]] }),
  )
  const invalid = structuredClone(source)
  invalid.elements[0].lat = 900
  assert.throws(() => validateSnapshot(invalid))
})
