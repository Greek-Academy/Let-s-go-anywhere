import { comparisonDefinition, sourceUrl } from './core.mjs'
import { PilotError } from '../spot-research/core.mjs'

export const BRAVE_SEARCH_LIMIT = 4

// Use the catalog's geographic reference instead of transmitting GPS to Brave.
// The precise (rounded) origin and all conditions still go to Gemini and Routes.
export function braveQueries(query) {
  const input = JSON.parse(comparisonDefinition(query).input)
  const origin = input.station ?? input.nearbyReference
  const place = `${origin.prefecture} ${origin.name}発`
  const hobbies = query.drive?.hobbies ?? []
  const groups = Array.from(
    { length: Math.min(BRAVE_SEARCH_LIMIT, Math.max(3, hobbies.length)) },
    () => [],
  )
  hobbies.forEach((hobby, index) => groups[index % groups.length].push(hobby))
  const dates = query.eventDates ? Object.values(query.eventDates).flat().join(' ') : ''
  const theme =
    query.drive?.mode === 'conditions'
      ? [...query.drive.activities, query.drive.timing, query.drive.road, query.drive.pace]
          .filter((v) => v !== 'こだわらない')
          .join(' ')
      : query.drive?.mode === 'default'
        ? ''
        : query.theme
  const variants = [
    '日帰り おすすめ 観光スポット',
    '周辺県 おでかけ 行き先 一覧',
    '観光協会 おすすめ ドライブコース',
    'デート 立ち寄りスポット',
  ]
  return [
    ...new Set(
      groups.map((group, index) =>
        [
          place,
          query.drive ? `車で片道${query.drive.duration} ドライブ` : '駅周辺',
          (group.length ? group : hobbies).join(' '),
          theme,
          dates,
          query.purpose === 'events' ? 'イベント 開催日 会場 公式' : variants[index],
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 600),
      ),
    ),
  ]
}

export function braveEvidence(responses) {
  const sources = []
  const seen = new Set()
  let remaining = 48_000
  const batches = responses.map((response) =>
    Array.isArray(response?.grounding?.generic) ? response.grounding.generic.slice(0, 50) : [],
  )
  // Interleave sources so the first hobby cannot consume the context budget.
  for (let index = 0; index < Math.max(0, ...batches.map((b) => b.length)); index++) {
    for (const batch of batches) {
      const item = batch[index]
      const url = sourceUrl(item?.url)
      const snippets = Array.isArray(item?.snippets)
        ? item.snippets.filter((s) => typeof s === 'string' && s.trim()).join('\n')
        : ''
      if (!url || !snippets || seen.has(url) || sources.length >= 60 || remaining <= 0) continue
      const claims = [
        `${typeof item.title === 'string' ? item.title.slice(0, 300) : ''}\n${snippets}`.slice(
          0,
          Math.min(4500, remaining),
        ),
      ]
      seen.add(url)
      remaining -= claims[0].length
      sources.push({ id: `s${sources.length}`, url, claims })
    }
  }
  if (!sources.length)
    throw new PilotError(
      'sources',
      'Brave検索で候補を確認できる情報を取得できませんでした。条件を変えてお試しください。',
      502,
    )
  return {
    text: 'Brave Searchで取得したページの抜粋。各候補は対応するsourceIdの内容に基づいて作成してください。',
    sources,
  }
}

export async function searchBrave(
  query,
  { apiKey, fetcher = fetch, signal, onAttempt = () => {} },
) {
  if (!apiKey) throw new PilotError('key', 'Brave SearchのAPIキーを設定してください。', 503)
  // A fixed batch, no retries or fallback. All requests finish before returning,
  // including failures, so another app search cannot overlap unfinished requests.
  const responses = await Promise.allSettled(
    braveQueries(query).map(async (q) => {
      const url = new URL('https://api.search.brave.com/res/v1/llm/context')
      url.search = new URLSearchParams({
        q,
        country: 'JP',
        search_lang: 'jp',
        count: '30',
        maximum_number_of_tokens: '4096',
        maximum_number_of_urls: '15',
        maximum_number_of_tokens_per_url: '1024',
        context_threshold_mode: 'balanced',
        safesearch: 'moderate',
        enable_local: 'false',
      }).toString()
      onAttempt()
      const response = await fetcher(url.href, {
        redirect: 'manual',
        signal,
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      })
      if (!response.ok)
        throw new PilotError(
          'brave',
          response.status === 401 || response.status === 403
            ? 'Brave SearchのAPIキーとSearchプランの有効化をご確認ください。'
            : response.status === 429
              ? 'Brave Searchの利用枠または同時リクエスト制限に達しました。管理画面をご確認ください。'
              : 'Brave検索に接続できませんでした。時間をおいてお試しください。',
          502,
        )
      return response.json()
    }),
  )
  const failed = responses.find((r) => r.status === 'rejected')
  if (failed) throw failed.reason
  return braveEvidence(responses.map((r) => r.value))
}
