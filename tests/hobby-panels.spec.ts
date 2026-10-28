import { test, expect } from '@playwright/test'
import { driveQuery, driveTheme, withoutDriveTravel } from '../src/domain/driveSearch'
import { parseWebSearchResult } from '../src/domain/webSearch'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'
import { fromWebSpot } from '../src/sharing/candidates'
import { mergePlace } from '../src/domain/placeIdentity'
// @ts-expect-error Offline provider fixture, never an actual API request.
import { runComparison } from '../tools/spot-comparison/providers.mjs'

const drive = driveQuery('default', undefined, ['自然', 'グルメ', '温泉'])
const query = { stationId: '1130208', region: '東京都 新宿駅周辺', theme: driveTheme(drive), drive }

test('hobby labels survive saving and coexist with legacy candidates, without leaking to shared candidates', async () => {
  const result = await parseWebSearchResult(await runComparison({ query, demo: true }), query)
  expect(result.spots.map((s) => s.hobby)).toEqual([
    '自然',
    'グルメ',
    '温泉',
    '自然',
    'グルメ',
    '温泉',
    '自然',
    'グルメ',
    '温泉',
    '自然',
  ])
  const saved = result.spots.map(withoutDriveTravel)
  const { hobby: _hobby, matchedHobbies: _matches, ...legacy } = saved[1]
  const state = { ...createInitialState(), savedWebSpots: [saved[0], legacy] }
  expect(decodeStoredState(JSON.stringify(state))).toEqual({ state, problem: null })
  expect(fromWebSpot(saved[0])).not.toHaveProperty('hobby')
  expect(fromWebSpot(saved[0])).not.toHaveProperty('matchedHobbies')
  expect(mergePlace(legacy, saved[1])).toHaveProperty('hobby', saved[1].hobby)
  const bad = { ...state, savedWebSpots: [{ ...saved[0], hobby: '温泉' }] }
  expect(decodeStoredState(JSON.stringify(bad)).problem).not.toBeNull()
})

test('unselected or inconsistent hobby metadata is rejected and old search results remain readable', async () => {
  const result = await runComparison({ query, demo: true })
  for (const change of [
    { matchedHobbies: ['買い物'], hobby: '買い物' },
    { matchedHobbies: ['自然'], hobby: '温泉' },
    { matchedHobbies: undefined, hobby: '自然' },
    { matchedHobbies: ['自然'], hobby: undefined },
    { matchedHobbies: ['自然', '自然'], hobby: '自然' },
  ]) {
    const bad = structuredClone(result)
    Object.assign(bad.spots[0], change)
    await expect(parseWebSearchResult(bad, query)).rejects.toThrow()
  }
  const old = structuredClone(result)
  for (const spot of old.spots) {
    delete spot.matchedHobbies
    delete spot.hobby
  }
  const parsed = await parseWebSearchResult(old, query)
  expect(parsed.spots).toHaveLength(10)
  expect(parsed.spots.every((s) => s.hobby === undefined)).toBe(true)
})
