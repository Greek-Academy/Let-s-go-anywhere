import { expect, test } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'
import { parseWebSearchResult, decodeSavedWebSpots, sameWebSpot } from '../src/domain/webSearch'
import { eventDates, addDays } from '../src/domain/eventSearch'
import { fromWebSpot } from '../src/sharing/candidates'
// @ts-expect-error Offline JS provider fixtures; no external requests.
import { runComparison } from '../tools/spot-comparison/providers.mjs'
const query = {
  stationId: '1130208',
  region: '東京都 新宿駅周辺',
  theme: 'イベント',
  purpose: 'events' as const,
  eventDates: eventDates({ mode: 'today', date: '' })!,
}

test('event saves retain schedule/source; different year/venue and permanent spots remain distinct', async () => {
  const response = await runComparison({ query, demo: true })
  const first = await parseWebSearchResult(response, query)
  expect(decodeSavedWebSpots(first.spots)).toEqual(first.spots)
  expect(fromWebSpot(first.spots[0]).status).toContain(query.eventDates.start)
  const next = structuredClone(response)
  next.query.eventDates = {
    start: addDays(query.eventDates.start, 365),
    end: addDays(query.eventDates.start, 365),
  }
  next.spots.forEach((s: { event: { startDate: string; endDate: string; occursOn: string[] } }) => {
    s.event.startDate = next.query.eventDates.start
    s.event.endDate = next.query.eventDates.end
    s.event.occursOn = [next.query.eventDates.start]
  })
  const second = await parseWebSearchResult(next, next.query)
  expect(sameWebSpot(first.spots[0], second.spots[0])).toBe(false)
  expect(decodeSavedWebSpots([first.spots[0], second.spots[0]])).toHaveLength(2)
  await expect(
    parseWebSearchResult(response, { ...query, purpose: undefined, eventDates: undefined }),
  ).rejects.toThrow()
  const bad = structuredClone(response)
  bad.spots[0].event.occursOn = []
  await expect(parseWebSearchResult(bad, query)).rejects.toThrow()
  const state = createInitialState()
  state.savedWebSpots = first.spots
  expect(decodeStoredState(JSON.stringify(state))).toEqual({ state, problem: null })
})
test('legacy category migration preserves recommended input and saved data; old events show ended notice', async ({
  page,
}) => {
  for (const category of ['今週末', 'スポット']) {
    const state = createInitialState()
    state.discover.category = category
    state.discover.search = 'カフェ'
    state.savedEvents = ['fuji']
    delete state.discover.eventSelection
    const decoded = decodeStoredState(JSON.stringify(state))
    expect(decoded.problem).toBeNull()
    expect(decoded.state.discover.category).toBe(category === '今週末' ? 'イベント' : 'おすすめ')
    expect(decoded.state.discover.eventSelection?.mode).toBe(
      category === '今週末' ? 'weekend' : 'today',
    )
    expect(decoded.state.discover.search).toBe('カフェ')
    expect(decoded.state.savedEvents).toEqual(['fuji'])
  }
  const { spots } = await parseWebSearchResult(await runComparison({ query, demo: true }), query)
  const state = createInitialState()
  state.onboarded = true
  state.savedWebSpots = [spots[0]]
  await page.addInitScript(
    (s) => localStorage.setItem('driveplus.mock.v1', JSON.stringify(s)),
    state,
  )
  await page.clock.install({ time: new Date(`${addDays(query.eventDates.end, 1)}T03:00:00Z`) })
  await page.goto(`/#/web-spots/${spots[0].id}`)
  await expect(page.locator('.web-event-schedule')).toContainText('開催期間は終了')
  await expect(page.getByRole('button', { name: '行きたいに保存済み', exact: true })).toBeEnabled()
})
