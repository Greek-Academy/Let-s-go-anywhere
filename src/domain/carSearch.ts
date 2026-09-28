import { carProviders, carSearchLinkCheckedAt } from '../data/carProviders'
import type { CarProviderId } from '../data/carProviders'
import type { StationType } from '../data/types'

export interface CarSearchConditions {
  area: string | null
  type: StationType
  provider: CarProviderId | null
}
export type CarSearchRequest =
  | {
      type: 'car-search'
      target: 'map'
      area: string
      service: StationType
      provider: CarProviderId | null
    }
  | { type: 'car-search'; target: 'provider'; provider: CarProviderId }

export function carSearchAreaError(area: string): string | null {
  if (typeof area !== 'string' || !area.trim()) return '駅名・地域を入力してください。'
  if (area.trim().length > 80) return '駅名・地域は80文字以内で入力してください。'
  if (/[\u0000-\u001f\u007f]/.test(area)) return '改行や制御文字を含めずに入力してください。'
  return null
}

/** A user-authored search, never a verified location, route or station listing. */
export function carSearchDestination(request: CarSearchRequest) {
  const provider = carProviders.find((item) => item.id === request.provider)
  if (request.target === 'provider') {
    if (!provider) throw new Error('Unknown provider')
    return {
      url: provider.searchUrl,
      host: new URL(provider.searchUrl).hostname,
      checkedAt: carSearchLinkCheckedAt,
    }
  }
  if (
    request.target !== 'map' ||
    carSearchAreaError(request.area) ||
    !['すべて', 'レンタカー', 'カーシェア'].includes(request.service) ||
    (request.provider !== null && !provider) ||
    (provider && request.service !== 'すべて' && provider.type !== request.service)
  )
    throw new Error('Invalid car search')
  const category =
    provider?.name ?? (request.service === 'すべて' ? 'レンタカー カーシェア' : request.service)
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', `${request.area.trim()} ${category}`)
  if (url.href.length > 2048) throw new Error('Search URL too long')
  return { url: url.href, host: url.hostname }
}
