export interface PlacePhoto {
  imageUrl: string
  sourceUrl: string
  authors: { name: string; url: string; avatar?: string }[]
}

export function googlePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8000) return
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
    )
      return url.href
  } catch {
    /* Untrusted metadata must never become a URL. */
  }
}
export function googleMapsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8000) return
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return
    if (
      ['maps.google.com', 'maps.google.co.jp'].includes(url.hostname) ||
      (['www.google.com', 'google.com', 'www.google.co.jp'].includes(url.hostname) &&
        url.pathname.startsWith('/maps/'))
    )
      return url.href
  } catch {
    /* Refuse javascript:, lookalike domains, and arbitrary external URLs. */
  }
}
export function decodePlacePhoto(value: unknown): PlacePhoto {
  const p = value as Partial<PlacePhoto> | null
  const imageUrl = googlePhotoUrl(p?.imageUrl),
    sourceUrl = googleMapsUrl(p?.sourceUrl)
  if (!imageUrl || !sourceUrl || !Array.isArray(p?.authors) || p.authors.length > 10)
    throw new Error('写真の出典を確認できませんでした。')
  const authors = p.authors.map((a) => {
    const url = googleMapsUrl(a?.url)
    if (!url || typeof a?.name !== 'string' || !a.name.trim() || a.name.length > 300)
      throw new Error('撮影者の表示を確認できませんでした。')
    const avatar = googlePhotoUrl(a.avatar)
    return { name: a.name, url, ...(avatar ? { avatar } : {}) }
  })
  return { imageUrl, sourceUrl, authors }
}
