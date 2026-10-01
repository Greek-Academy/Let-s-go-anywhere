import { test as base, expect } from '@playwright/test'
import { PbfWriter } from 'pbf'

// Synthetic MVT, not downloaded public tiles. No CI traffic to the public service.
const writer = new PbfWriter()
function layer(
  name: string,
  type: number,
  geometry: number[],
  properties: Record<string, string | number>,
) {
  writer.writeMessage(
    3,
    (_, pbf: PbfWriter) => {
      pbf.writeVarintField(15, 2)
      pbf.writeStringField(1, name)
      pbf.writeVarintField(5, 4096)
      pbf.writeMessage(
        2,
        (_, feature: PbfWriter) => {
          feature.writeVarintField(3, type)
          feature.writePackedVarint(
            2,
            Object.keys(properties).flatMap((_, i) => [i, i]),
          )
          feature.writePackedVarint(4, geometry)
        },
        null,
      )
      for (const [key, value] of Object.entries(properties)) {
        pbf.writeStringField(3, key)
        pbf.writeMessage(
          4,
          (_, valueWriter: PbfWriter) => {
            if (typeof value === 'string') valueWriter.writeStringField(1, value)
            else valueWriter.writeVarintField(5, value)
          },
          null,
        )
      }
    },
    null,
  )
}
layer('waterarea', 3, [9, 0, 0, 26, 2000, 0, 0, 8192, 1999, 0, 15], { ftCode: 5000 })
layer('road', 2, [9, 0, 4096, 10, 8192, 0], { ftCode: 2701, rdCtg: 1 })
layer('label', 1, [9, 4096, 4096], { annoCtg: 422, knj: '検証駅' })
export const mapFixture = Buffer.from(writer.finish())
export const mapPattern = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/**'
export const test = base.extend<{ mockMap: void }>({
  mockMap: [
    async ({ context }, use) => {
      await context.route(mapPattern, (route) =>
        route.fulfill({
          body: mapFixture,
          contentType: 'application/vnd.mapbox-vector-tile',
          headers: { 'access-control-allow-origin': '*' },
        }),
      )
      await use()
    },
    { auto: true },
  ],
})
export { expect }

// Clusters and single pins together represent the registered candidates in this search.
export async function expectMapStationCount(page: import('@playwright/test').Page, count: number) {
  await expect
    .poll(() =>
      page
        .locator('.real-map-pin, .real-map-cluster')
        .evaluateAll((nodes) =>
          nodes.reduce(
            (sum, node) => sum + Number((node as HTMLElement).dataset.stationCount || 0),
            0,
          ),
        ),
    )
    .toBe(count)
}
