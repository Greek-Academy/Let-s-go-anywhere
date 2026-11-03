import { expect, test } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { driveQuery } from '../../../src/domain/driveSearch'

for (const category of ['イベント', '今週末']) {
  test(`旧「${category}」からおすすめへ移行し、自由入力・条件検索が使える`, async ({
    page,
  }, info) => {
    const state = createInitialState()
    state.onboarded = true
    state.profile.interests = ['買い物']
    state.savedEvents = ['fuji']
    state.discover = {
      ...state.discover,
      category,
      driveMode: 'free',
      eventSelection: { mode: 'custom', date: '2026-11-03' },
      region: 'station',
      stationId: '1130208',
      search: 'カフェ',
    }
    const posts: Record<string, any>[] = []
    page.on('request', (r) => {
      if (r.url().endsWith('/api/spot-search/compare')) posts.push(r.postDataJSON())
    })
    await page.addInitScript((s) => {
      if (!localStorage.getItem('driveplus.mock.v1'))
        localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
    }, state)
    await page.goto('/#/discover')
    await expect(page.getByRole('heading', { name: '出発地と趣味から探す' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'イベント', exact: true })).toHaveCount(0)
    await expect(page.locator('.discovery-chips, .event-date-picker')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'お出かけを検索' })).toHaveValue('カフェ')
    expect(posts).toHaveLength(0)
    await page.getByRole('button', { name: 'この希望で探す', exact: true }).click()
    await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
    await expect(page.locator('.web-spot-card')).toHaveCount(10)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ theme: 'カフェ', drive: driveQuery('free') })
    expect(posts[0]).not.toHaveProperty('purpose')
    expect(posts[0]).not.toHaveProperty('eventDates')
    const positions = await page.locator('.drive-home-feed').evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      card: el.querySelector('.web-spot-card')!.getBoundingClientRect().top,
    }))
    expect(positions.card - positions.top).toBeLessThan(40)
    await info.attach('タブなしで先頭に並ぶおすすめ', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    await page.getByRole('button', { name: '気分から選ぶ', exact: true }).click()
    await page.getByRole('button', { name: '温泉でくつろぎたい', exact: true }).click()
    await page.getByRole('button', { name: '選んだ条件で探す', exact: true }).click()
    await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
    expect(posts).toHaveLength(2)
    expect(posts[1].drive.mode).toBe('conditions')
    expect(posts[1].drive.activities).toEqual(['温泉でくつろぎたい'])
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
    expect(stored.discover.category).toBe('おすすめ')
    expect(stored.discover.eventSelection).toBeUndefined()
    expect(stored.savedEvents).toEqual(['fuji'])
    expect(stored.profile.interests).toEqual(['買い物'])
    await page.reload()
    await expect(page.locator('.discovery-chips, .event-date-picker')).toHaveCount(0)
    expect(posts).toHaveLength(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
