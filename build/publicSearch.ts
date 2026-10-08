/** Only the explicitly configured pilot Worker can receive Firebase ID tokens. */
export function resolvePublicSearch(mode: string, env: Record<string, string | undefined>) {
  const origin = env.DRIVEPLUS_SEARCH_ORIGIN ?? ''
  if (!origin) return null
  if (mode === 'emulator' && origin === 'http://127.0.0.1:8787') return origin
  if (
    mode !== 'firebase' ||
    !/^https:\/\/driveplus-search-pilot\.[a-z0-9-]+\.workers\.dev$/.test(origin)
  )
    throw new Error('Public search must point to the approved HTTPS pilot Worker in Firebase mode.')
  return origin
}
