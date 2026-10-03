import type { Outing, SavedLink } from '../data/types'
import type { WebSpot } from '../domain/webSearch'
import { evaluateOuting, outingStateLabels } from '../domain/outingLifecycle'
import { normalizeSavedUrl } from '../domain/savedUrls'
import type { Candidate } from './model'

export function fromOuting(outing: Outing, now = new Date()): Candidate {
  const status = evaluateOuting(outing, now)
  return {
    kind: 'catalog',
    catalogId: outing.id,
    title: outing.title,
    area: outing.area,
    url: null,
    status: `${outingStateLabels[status.state]}（サンプル）`,
    sample: true,
    capturedAt: now.toISOString(),
  }
}
export function fromWebSpot(spot: WebSpot): Candidate {
  return {
    kind: 'web',
    catalogId: null,
    title: spot.name,
    area: spot.area,
    url: normalizeSavedUrl(spot.sourceUrl).url,
    status: spot.mode === 'sample' ? '検索サンプル・内容未確認' : 'Web取得・内容未確認',
    sample: spot.mode === 'sample',
    capturedAt: spot.retrievedAt,
  }
}
export function fromLink(link: Pick<SavedLink, 'title' | 'url'>, now = new Date()): Candidate {
  return {
    kind: 'link',
    catalogId: null,
    title: link.title.trim(),
    area: '',
    url: normalizeSavedUrl(link.url).url,
    status: '持ち込みリンク・内容未確認',
    sample: false,
    capturedAt: now.toISOString(),
  }
}
