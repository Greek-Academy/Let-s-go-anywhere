import { test, expect } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'
import {
  decodeDriveChoices,
  emptyDriveChoices,
  driveQuery,
  decodeDriveTravel,
} from '../src/domain/driveSearch'
test('new drive preferences migrate old data without losing saved outings, stations or hobbies', () => {
  const old = createInitialState()
  old.savedEvents = ['fuji']
  old.profile.interests = ['自然']
  old.profile.stationId = '1130208'
  const { driveChoices: _choices, ...legacy } = old
  delete legacy.discover.driveMode
  delete legacy.discover.usageSamples
  const decoded = decodeStoredState(JSON.stringify(legacy))
  expect(decoded.problem).toBeNull()
  expect(decoded.state.driveChoices).toEqual(emptyDriveChoices())
  expect(decoded.state.discover.driveMode).toBe('default')
  expect(decoded.state.savedEvents).toEqual(['fuji'])
  expect(decoded.state.profile).toEqual(old.profile)
})
test('unknown drive conditions protect the original storage instead of resetting it', () => {
  const state = createInitialState()
  expect(() => decodeDriveChoices({ ...emptyDriveChoices(), activities: ['unapproved'] })).toThrow()
  expect(() => decodeDriveChoices({ ...emptyDriveChoices(), budget: 3000 })).toThrow()
  expect(() =>
    decodeDriveChoices({ ...emptyDriveChoices(), activities: ['海を見たい', '海を見たい'] }),
  ).toThrow()
  expect(
    decodeStoredState(
      JSON.stringify({ ...state, driveChoices: { ...state.driveChoices, extra: true } }),
    ).problem,
  ).toBe('invalid')
  expect(driveQuery('events', emptyDriveChoices(), ['自然', 'unknown']).hobbies).toEqual(['自然'])
})
test('time results distinguish real calculations and samples and accept only bounded transient values', () => {
  const travel = {
    status: 'calculated',
    durationSeconds: 9000,
    distanceMeters: 100000,
    checkedAt: '2026-10-20T00:00:00.000Z',
    expiresAt: '2026-10-20T00:10:00.000Z',
  }
  expect(decodeDriveTravel(travel, 'live')).toEqual(travel)
  expect(() => decodeDriveTravel(travel, 'sample')).toThrow()
  expect(() =>
    decodeDriveTravel({ ...travel, expiresAt: '2027-10-20T00:10:00.000Z' }, 'live'),
  ).toThrow()
  expect(() => decodeDriveTravel({ ...travel, durationSeconds: -1 }, 'live')).toThrow()
  expect(decodeDriveTravel({ status: 'unconfirmed' }, 'live')).toEqual({ status: 'unconfirmed' })
})
