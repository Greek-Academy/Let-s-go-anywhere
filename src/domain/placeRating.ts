/** Google Places content is used only in the current view, never in saved/shared data. */
export interface PlaceRating {
  rating: number
  count: number
  mapsUrl: string
  checkedAt: string
  expiresAt: string
  attributions: { name: string; url: string }[]
}

export function decodePlaceRating(value: unknown, now = Date.now()): PlaceRating | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const v = value as PlaceRating
    if (
      !Number.isFinite(v.rating) ||
      v.rating < 1 ||
      v.rating > 5 ||
      !Number.isSafeInteger(v.count) ||
      v.count < 1 ||
      typeof v.checkedAt !== 'string' ||
      typeof v.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(v.checkedAt)) ||
      Date.parse(v.expiresAt) - Date.parse(v.checkedAt) !== 600_000 ||
      Date.parse(v.checkedAt) > now + 60_000 ||
      Date.parse(v.expiresAt) <= now ||
      typeof v.mapsUrl !== 'string' ||
      v.mapsUrl.length > 2048 ||
      !Array.isArray(v.attributions) ||
      v.attributions.length > 10
    )
      return
    const url = new URL(v.mapsUrl)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !(
        url.hostname === 'maps.google.com' ||
        (url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/'))
      )
    )
      return
    const attributions = v.attributions.map((a) => {
      if (
        !a ||
        typeof a.name !== 'string' ||
        !a.name.trim() ||
        a.name.length > 200 ||
        /[\u0000-\u001f\u007f]/u.test(a.name) ||
        typeof a.url !== 'string' ||
        a.url.length > 2048
      )
        throw new Error('Invalid attribution')
      const link = new URL(a.url)
      if (link.protocol !== 'https:' || link.username || link.password || link.port)
        throw new Error('Invalid attribution URL')
      return { name: a.name.trim(), url: link.href }
    })
    return {
      rating: v.rating,
      count: v.count,
      mapsUrl: url.href,
      checkedAt: v.checkedAt,
      expiresAt: v.expiresAt,
      attributions,
    }
  } catch {
    return
  }
}
