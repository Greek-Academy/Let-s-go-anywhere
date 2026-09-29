import { test as base } from '@playwright/test'
export { expect } from '@playwright/test'
// Keep automated tests independent of the public tile server. This is a test-only
// neutral image, not a GSI tile and not an offline map cache.
export const test = base.extend<{ mapTileStub: void }>({
  mapTileStub: [
    async ({ context }, use) => {
      await context.route('https://cyberjapandata.gsi.go.jp/**', (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
            'base64',
          ),
        }),
      )
      await use()
    },
    { auto: true },
  ],
})
