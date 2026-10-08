import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClient } from './client'
import { publicSearchOrigin } from '../domain/publicSearchConfig'

let grant: { uid: string; code: string } | null = null
let observing = false
export const searchSessionEvent = 'driveplus-search-session-change'

function client() {
  const { auth } = getFirebaseClient()
  if (!observing) {
    observing = true
    let previous = auth.currentUser?.uid ?? null
    onAuthStateChanged(auth, (user) => {
      if ((user?.uid ?? null) !== previous) {
        previous = user?.uid ?? null
        grant = null
        window.dispatchEvent(new Event(searchSessionEvent))
      }
    })
  }
  return auth
}

export async function publicSearchFetch(path: string, options: RequestInit = {}) {
  if (!publicSearchOrigin || !['comparison-status', 'comparison-result', 'compare'].includes(path))
    throw new Error('公開検索の接続準備中です。')
  const auth = client()
  const user = auth.currentUser
  if (!user?.emailVerified || !grant || grant.uid !== user.uid)
    throw new Error('「AI検索の参加・ログイン」から、メール確認と参加コードの入力をしてください。')
  const code = grant.code
  const token = await user.getIdToken()
  if (auth.currentUser?.uid !== user.uid || grant?.code !== code)
    throw new Error('ログイン状態が変わりました。もう一度参加してください。')
  const response = await fetch(`${publicSearchOrigin}/api/spot-search/${path}`, {
    ...options,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Test-Code': code,
    },
  })
  if (auth.currentUser?.uid !== user.uid || grant?.code !== code)
    throw new Error('ログイン状態が変わりました。もう一度参加してください。')
  return response
}

export async function joinPublicSearch(code: string) {
  const auth = client()
  const user = auth.currentUser
  if (!user?.emailVerified) throw new Error('メールを確認してログインしてください。')
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('参加コードを確認してください。')
  grant = { uid: user.uid, code }
  try {
    const response = await publicSearchFetch('comparison-status', {
      signal: AbortSignal.timeout(15_000),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? '参加状態を確認できません。')
    return data as { globalRemaining: number; attempts: unknown[]; enabled: boolean }
  } catch (error) {
    grant = null
    throw error
  }
}
