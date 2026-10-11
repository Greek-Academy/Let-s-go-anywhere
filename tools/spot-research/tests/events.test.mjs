import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eventDates,
  eventDateError,
  decodeEventDates,
  decodeEventSchedule,
  addDays,
} from '../../../src/domain/eventSearch.ts'
import {
  validateComparisonQuery,
  buildComparisonRequest,
  parseComparisonResponse,
  combineCandidates,
} from '../../spot-comparison/core.mjs'
import { comparisonSample } from '../../spot-comparison/sample.mjs'
const dates = eventDates({ mode: 'today', date: '' })
const query = { stationId: '1130208', theme: 'イベント', purpose: 'events', eventDates: dates }

test('JST midnight, Sunday remainder, next weekend and leap-day validity', () => {
  assert.deepEqual(eventDates({ mode: 'today' }, new Date('2026-10-10T15:00:00Z')), {
    start: '2026-10-11',
    end: '2026-10-11',
  })
  assert.deepEqual(eventDates({ mode: 'weekend' }, new Date('2026-10-11T03:00:00Z')), {
    start: '2026-10-11',
    end: '2026-10-11',
  })
  assert.deepEqual(eventDates({ mode: 'weekend' }, new Date('2026-10-12T03:00:00Z')), {
    start: '2026-10-17',
    end: '2026-10-18',
  })
  assert.throws(() => decodeEventDates({ start: '2026-02-29', end: '2026-02-29' }))
  assert.deepEqual(decodeEventDates({ start: '2028-02-29', end: '2028-02-29' }), {
    start: '2028-02-29',
    end: '2028-02-29',
  })
  assert.ok(eventDateError({ start: addDays(dates.start, -1), end: dates.end }))
})
test('event query has only location/date, bounded dates and the same paid-tool limits', () => {
  const valid = validateComparisonQuery(query)
  const o = buildComparisonRequest('openai', valid),
    a = buildComparisonRequest('anthropic', valid)
  const input = JSON.parse(o.input)
  assert.deepEqual(input, JSON.parse(a.messages[0].content))
  assert.equal(input.theme, undefined)
  assert.deepEqual(input.eventDates, dates)
  assert.match(o.instructions, /Exclude undated, past-year, cancelled/)
  assert.equal(o.max_tool_calls, 2)
  assert.equal(a.tools[0].max_uses, 2)
  assert.equal(
    o.text.format.schema.properties.spots.items.properties.event.properties.status.enum[0],
    'scheduled',
  )
  for (const bad of [
    { ...query, theme: 'カフェ' },
    { ...query, eventDates: undefined },
    { ...query, purpose: 'anything' },
    { ...query, eventDates: { start: dates.start, end: addDays(dates.start, 3) } },
    {
      ...query,
      eventDates: { start: addDays(dates.start, -365), end: addDays(dates.start, -365) },
    },
    { ...query, eventDates: { start: addDays(dates.start, 366), end: addDays(dates.start, 366) } },
  ])
    assert.throws(() => validateComparisonQuery(bad))
})
test('both providers omit missing year/date, cancellation, wrong occurrence day and fabricated citations', () => {
  for (const provider of ['openai', 'anthropic']) {
    const response = comparisonSample(provider, query)
    const part = provider === 'openai' ? response.output[1].content[0] : response.content[2]
    const data = JSON.parse(part.text)
    delete data.spots[0].event
    data.spots[1].event.startDate = '10-11'
    data.spots[2].event.status = 'cancelled'
    data.spots[3].event.occursOn = [addDays(dates.start, 1)]
    data.spots[4].event.startDate = addDays(dates.start, -365)
    data.spots[4].event.endDate = addDays(dates.start, -365)
    data.spots[5].sourceUrl = 'https://example.com/fabricated'
    part.text = JSON.stringify(data)
    const result = parseComparisonResponse(provider, response, query)
    assert.equal(result.spots.length, 4)
    assert.equal(result.omitted, 6)
    assert.equal(result.spots[0].verification, 'unconfirmed')
    assert.equal(parseComparisonResponse(provider, response).spots.length, 1) // only old-style candidate without event remains
  }
})
test('event dedup needs same occurrence and venue; permanent place and another year stay separate', () => {
  const sample = parseComparisonResponse('openai', comparisonSample('openai', query), query)
    .spots[0]
  const otherYear = {
    ...sample,
    event: {
      ...sample.event,
      startDate: addDays(dates.start, 365),
      endDate: addDays(dates.start, 365),
      occursOn: [addDays(dates.start, 365)],
    },
  }
  const otherVenue = { ...sample, event: { ...sample.event, venue: '別の会場' } }
  const permanent = { ...sample }
  delete permanent.event
  const result = combineCandidates([
    { spots: [sample, otherYear, otherVenue, permanent] },
    { spots: [sample] },
  ])
  assert.equal(result.spots.length, 4)
  assert.equal(result.duplicates, 1)
  assert.throws(() => decodeEventSchedule({ ...sample.event, occursOn: [] }))
})
