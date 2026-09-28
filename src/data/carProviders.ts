/** Search entrances only. These are not station records or a data-use agreement. */
export const carProviders = [
  {
    id: 'times',
    name: 'タイムズカー',
    type: 'カーシェア',
    searchUrl: 'https://share.timescar.jp/place/',
  },
  {
    id: 'toyota',
    name: 'トヨタレンタカー',
    type: 'レンタカー',
    searchUrl: 'https://rent.toyota.co.jp/shop/',
  },
  {
    id: 'orix',
    name: 'オリックスレンタカー',
    type: 'レンタカー',
    searchUrl: 'https://car.orix.co.jp/shop/',
  },
  {
    id: 'nippon',
    name: 'ニッポンレンタカー',
    type: 'レンタカー',
    searchUrl: 'https://store.nipponrentacar.co.jp/b/nrs/',
  },
] as const
export type CarProviderId = (typeof carProviders)[number]['id']
export const carSearchLinkCheckedAt = '2026-09-29'
