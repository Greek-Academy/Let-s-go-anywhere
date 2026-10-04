import tags from '../data/recommendationTags.json' with { type: 'json' }
import { outboundHttpsUrl } from './externalLinks'
import type { WebSpot } from './webSearch'

export const recommendationTags: readonly string[] = tags
export type RecommendationProvider = 'openai' | 'anthropic'
export const providerNames = { openai: 'OpenAI', anthropic: 'Claude' } as const
export interface Recommendation {
  provider: RecommendationProvider
  sourceUrl: string
  reason: string
}
export interface ProviderReport {
  provider: RecommendationProvider
  model: string
  state: 'completed' | 'failed'
  count: number
  omitted: number
  elapsedMs: number
  usage: {
    estimatedUsd: number
    searchCalls: number
    inputTokens: number
    outputTokens: number
    pricingDate: string
  } | null
  error: string | null
}
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('比較結果の形式が不正です。')
  return v as Record<string, unknown>
}
export function decodeTags(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    new Set(value).size !== value.length ||
    value.some((t) => !tags.includes(t))
  )
    throw new Error('候補の分類を確認できません。')
  return value as string[]
}
export function decodeRecommendations(value: unknown): Recommendation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2)
    throw new Error('提案元を確認できません。')
  const providers = new Set()
  return value.map((entry) => {
    const r = obj(entry)
    if (
      Object.keys(r).some((k) => !['provider', 'sourceUrl', 'reason'].includes(k)) ||
      !['openai', 'anthropic'].includes(String(r.provider)) ||
      providers.has(r.provider) ||
      typeof r.sourceUrl !== 'string' ||
      typeof r.reason !== 'string' ||
      !r.reason.trim() ||
      r.reason.length > 300 ||
      /[\u0000-\u001f\u007f]/u.test(r.reason)
    )
      throw new Error('提案内容を確認できません。')
    providers.add(r.provider)
    return {
      provider: r.provider as RecommendationProvider,
      sourceUrl: outboundHttpsUrl(r.sourceUrl).href,
      reason: r.reason.trim(),
    }
  })
}
export function decodeReports(value: unknown): ProviderReport[] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('比較の実行記録が不正です。')
  const providers = new Set()
  return value.map((entry) => {
    const r = obj(entry)
    if (
      !['openai', 'anthropic'].includes(String(r.provider)) ||
      providers.has(r.provider) ||
      !['completed', 'failed'].includes(String(r.state)) ||
      typeof r.model !== 'string' ||
      r.model.length > 80 ||
      !r.model ||
      ![r.count, r.omitted].every(
        (n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 10,
      ) ||
      Number(r.count) + Number(r.omitted) > 10 ||
      !Number.isSafeInteger(r.elapsedMs) ||
      Number(r.elapsedMs) < 0 ||
      (r.error !== null && (typeof r.error !== 'string' || r.error.length > 500)) ||
      (r.state === 'failed' && r.count !== 0)
    )
      throw new Error('比較の実行記録が不正です。')
    providers.add(r.provider)
    let usage: ProviderReport['usage'] = null
    if (r.usage !== null) {
      const u = obj(r.usage)
      if (
        typeof u.estimatedUsd !== 'number' ||
        !Number.isFinite(u.estimatedUsd) ||
        u.estimatedUsd < 0 ||
        ![u.searchCalls, u.inputTokens, u.outputTokens].every(
          (n) => Number.isSafeInteger(n) && Number(n) >= 0,
        ) ||
        typeof u.pricingDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(u.pricingDate)
      )
        throw new Error('参考料金を確認できません。')
      usage = {
        estimatedUsd: u.estimatedUsd,
        searchCalls: Number(u.searchCalls),
        inputTokens: Number(u.inputTokens),
        outputTokens: Number(u.outputTokens),
        pricingDate: u.pricingDate,
      }
    }
    return {
      provider: r.provider as RecommendationProvider,
      model: r.model,
      state: r.state as ProviderReport['state'],
      count: Number(r.count),
      omitted: Number(r.omitted),
      elapsedMs: Number(r.elapsedMs),
      error: r.error as string | null,
      usage,
    }
  })
}

export function preferenceWeights(saved: WebSpot[], mode: WebSpot['mode']) {
  const weights = new Map<string, number>()
  let likes = 0
  for (const spot of saved) {
    if (spot.mode !== mode || !spot.recommendations) continue
    const selected = spot.likedFor ?? spot.tags ?? []
    if (!selected.length) continue
    likes++
    for (const tag of selected) weights.set(tag, (weights.get(tag) ?? 0) + 1)
  }
  return { weights, likes }
}
export function personalRecommendations(spots: WebSpot[], saved: WebSpot[], mode: WebSpot['mode']) {
  const { weights } = preferenceWeights(saved, mode)
  const scored = spots.map((spot, index) => ({
    spot,
    index,
    score: (spot.tags ?? []).reduce((sum, tag) => sum + (weights.get(tag) ?? 0), 0),
  }))
  if (!scored.some((s) => s.score > 0)) return spots
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index)
  const remaining = new Set(spots.map((s) => s.id)),
    result: WebSpot[] = []
  // Every fourth card follows the general order, keeping room for a different interest.
  while (remaining.size) {
    const pool = result.length % 4 === 3 ? scored : ranked
    const next = pool.find((s) => remaining.has(s.spot.id))!
    result.push(next.spot)
    remaining.delete(next.spot.id)
  }
  return result
}
