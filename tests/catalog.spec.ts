import { expect, test } from '@playwright/test'
import { createContentCatalog } from '../src/content/catalog'
import type { ContentCatalog } from '../src/content/catalog'
import { sampleCatalog } from '../src/content/sampleCatalog'

test('replacing a catalog supplies the selected snapshot without changing another source', () => {
  const input = structuredClone(sampleCatalog)
  input.outings[0].title = '別の入力データのタイトル'
  const second = createContentCatalog(input)
  input.outings[0].title = '作成後の入力変更'
  expect(second.outings[0].title).toBe('別の入力データのタイトル')
  expect(sampleCatalog.outings[0].title).not.toBe('別の入力データのタイトル')
  expect(() => {
    second.outings[0].tags.push('mutation')
  }).toThrow()
  const empty = createContentCatalog({
    ...sampleCatalog,
    outings: [],
    stations: [],
    arrivalGuides: {},
    tripFacts: {},
  })
  expect(empty.outings).toEqual([])
  expect(empty.stations).toEqual([])
})

test('invalid identities, dangling facts and unsupported sources do not fall back to sample content', () => {
  expect(() =>
    createContentCatalog({
      ...sampleCatalog,
      outings: [sampleCatalog.outings[0], sampleCatalog.outings[0]],
    }),
  ).toThrow('duplicate')
  expect(() => createContentCatalog({ ...sampleCatalog, outings: [] })).toThrow('matching outing')
  expect(() =>
    createContentCatalog({ ...sampleCatalog, source: 'approved' } as unknown as ContentCatalog),
  ).toThrow('fallback')
})
