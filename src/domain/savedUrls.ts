export interface NormalizedLink {
  url: string
  key: string
  source: string
}
const isDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

/** Pure input handling. Does not fetch, resolve redirects, or confer publication approval. */
export function normalizeSavedUrl(input: string): NormalizedLink {
  const text = input.trim()
  if (!text || text.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(text))
    throw new Error('スペースを含まない2,048文字以内のURLを入力してください。')
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new Error('https:// または http:// で始まる有効なURLを入力してください。')
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('http(s)の公開ページURLを入力してください。認証情報を含むURLは保存できません。')
  if (
    !host.includes('.') ||
    host.includes(':') ||
    /^[\d.]+$/.test(host) ||
    ['localhost', 'local', 'internal'].some((domain) => isDomain(host, domain))
  )
    throw new Error(
      'SNSや施設の公開ページURLを入力してください。端末内・IPアドレスのURLは保存できません。',
    )
  parsed.hostname = host
  if (parsed.port) throw new Error('通常のhttp(s)ポートで公開されたページURLを入力してください。')
  const isX = [
    'x.com',
    'www.x.com',
    'mobile.x.com',
    'twitter.com',
    'www.twitter.com',
    'mobile.twitter.com',
  ].includes(host)
  const source = isX
    ? 'X'
    : isDomain(host, 'tiktok.com')
      ? 'TikTok'
      : isDomain(host, 'instagram.com')
        ? 'Instagram'
        : host.replace(/^www\./, '')
  if (isX) parsed.hostname = 'x.com'
  // Only known post routes get an identity key. Arbitrary website query/fragment semantics remain intact.
  const xPost = isX
    ? parsed.pathname.match(
        /^\/(?:[A-Za-z0-9_]+\/status|i\/web\/status)\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/,
      )
    : null
  const tikTokPost =
    source === 'TikTok' ? parsed.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/) : null
  if (xPost || tikTokPost) {
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_/i.test(key) || (isX && ['s', 't'].includes(key))) parsed.searchParams.delete(key)
    }
    parsed.hash = ''
  }
  const key = xPost
    ? `x:post:${xPost[1]}`
    : tikTokPost
      ? `tiktok:video:${tikTokPost[1]}`
      : parsed.href
  return { url: parsed.href, key, source }
}

export function savedUrlKey(url: string): string | null {
  try {
    return normalizeSavedUrl(url).key
  } catch {
    return null
  }
}
