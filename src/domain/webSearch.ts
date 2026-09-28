import { researchSourceUrl } from './externalLinks'

export interface WebSpot {
  id: string
  name: string
  area: string
  summary: string
  matchReason: string
  sourceUrl: string
  retrievedAt: string
  verification: 'unconfirmed'
  mode: 'live' | 'sample'
}
export interface WebSearchResult {
  spots: WebSpot[]
  query: { region: '京都市'; theme: string }
  retrievedAt: string
  mode: 'live' | 'sample'
  omitted: number
}

const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('形式を確認できません。')
  return v as Record<string, unknown>
}
const shortText = (v: unknown, max = 300): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/u.test(v))
    throw new Error('文字情報を確認できません。')
  return v.trim()
}
const stamp = (v: unknown): string => {
  const value = shortText(v, 40)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error('検索日時を確認できません。')
  return value
}

/** Stable identity ignores fragment/tracking and query order, not the source itself. */
export function sourceIdentity(value: string): string {
  const url = researchSourceUrl(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  return url.href
}

export function decodeSavedWebSpots(value: unknown): WebSpot[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('保存件数を確認できません。')
  const ids = new Set<string>()
  const sources = new Set<string>()
  return value.map((entry) => {
    const s = record(entry)
    const fields = [
      'id',
      'name',
      'area',
      'summary',
      'matchReason',
      'sourceUrl',
      'retrievedAt',
      'verification',
      'mode',
    ]
    if (Object.keys(s).some((key) => !fields.includes(key)))
      throw new Error('不明な保存項目があります。')
    const id = shortText(s.id, 80)
    if (!/^web_(live|sample)_[a-f0-9]{64}$/.test(id) || ids.has(id))
      throw new Error('保存IDが不正です。')
    if (s.verification !== 'unconfirmed' || !['live', 'sample'].includes(String(s.mode)))
      throw new Error('確認状態が不正です。')
    const mode = s.mode as WebSpot['mode']
    if (!id.startsWith(`web_${mode}_`)) throw new Error('保存IDと取得元が一致しません。')
    const sourceUrl = researchSourceUrl(shortText(s.sourceUrl, 2048)).href
    const identity = `${mode}:${sourceIdentity(sourceUrl)}${mode === 'sample' ? ':' + shortText(s.name) : ''}`
    if (sources.has(identity)) throw new Error('同じ出典が重複しています。')
    ids.add(id)
    sources.add(identity)
    return {
      id,
      name: shortText(s.name),
      area: shortText(s.area),
      summary: shortText(s.summary),
      matchReason: shortText(s.matchReason),
      sourceUrl,
      retrievedAt: stamp(s.retrievedAt),
      verification: 'unconfirmed',
      mode,
    }
  })
}

export async function parseWebSearchResult(
  value: unknown,
  expected: { region: string; theme: string },
): Promise<WebSearchResult> {
  const data = record(value)
  const query = record(data.query)
  if (
    query.region !== '京都市' ||
    query.region !== expected.region ||
    query.theme !== expected.theme
  )
    throw new Error('検索条件と結果が一致しません。再検索は自動では行いません。')
  if (
    !['live', 'sample'].includes(String(data.mode)) ||
    !Array.isArray(data.spots) ||
    data.spots.length > 3
  )
    throw new Error('検索結果の形式を確認できません。')
  if (!Number.isInteger(data.omitted) || Number(data.omitted) < 0 || Number(data.omitted) > 3)
    throw new Error('検索結果の件数を確認できません。')
  const mode = data.mode as WebSpot['mode']
  const retrievedAt = stamp(data.retrievedAt)
  const spots: WebSpot[] = []
  const seen = new Set<string>()
  for (const entry of data.spots) {
    const s = record(entry)
    if (s.verification !== 'unconfirmed') throw new Error('検索結果の確認状態が不正です。')
    const sourceUrl = researchSourceUrl(shortText(s.sourceUrl, 2048)).href
    // Demo fixtures may use one site entrance for different fictitious places.
    const identity = `${mode}:${sourceIdentity(sourceUrl)}${mode === 'sample' ? ':' + shortText(s.name) : ''}`
    if (seen.has(identity)) continue
    seen.add(identity)
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
    spots.push({
      id: `web_${mode}_${hash}`,
      name: shortText(s.name),
      area: shortText(s.area),
      summary: shortText(s.summary),
      matchReason: shortText(s.matchReason),
      sourceUrl,
      retrievedAt,
      verification: 'unconfirmed',
      mode,
    })
  }
  return {
    spots,
    query: { region: '京都市', theme: shortText(query.theme, 80) },
    retrievedAt,
    mode,
    omitted: Number(data.omitted) + data.spots.length - spots.length,
  }
}
