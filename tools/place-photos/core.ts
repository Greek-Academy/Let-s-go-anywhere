import { mkdir, open, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import places from '../../src/data/photoPilotPlaces.json' with { type: 'json' }
import { decodePlacePhoto } from '../../src/domain/placePhoto.ts'
import type { PlacePhoto } from '../../src/domain/placePhoto.ts'

type Target = (typeof places)[number]
type GooglePlace = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  photos?: {
    name?: string
    googleMapsUri?: string
    authorAttributions?: { displayName?: string; uri?: string; photoUri?: string }[]
  }[]
}
export const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・「」『』]/gu, '')
    .replace(/[−ー－]/g, '-')
export function matchesPlace(target: Target, value: GooglePlace) {
  const name = value.displayName?.text
  const address = value.formattedAddress
  if (typeof name !== 'string' || typeof address !== 'string') return false
  const normalized = normalize(address)
  return (
    target.aliases.some((a) => normalize(a) === normalize(name)) &&
    target.addressParts.every((part) => normalized.includes(normalize(part))) &&
    new RegExp(`(?:^|[^0-9-])${target.streetNumber}(?:$|[^0-9-])`).test(normalized)
  )
}
export class PhotoPilotError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
async function limitedJson(response: Response): Promise<unknown> {
  if (!response.ok)
    throw new PhotoPilotError(
      'Googleの接続・課金設定または利用上限を確認してください。自動再試行はしません。',
      502,
    )
  const reader = response.body?.getReader()
  if (!reader) throw new PhotoPilotError('写真情報を読み込めませんでした。', 502)
  let length = 0,
    result = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 512_000) throw new PhotoPilotError('写真情報の応答が大きすぎます。', 502)
      result += decoder.decode(value, { stream: true })
    }
    return JSON.parse(result + decoder.decode())
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
export function createPhotoPilot({
  directory,
  getKey,
  fetcher = fetch,
}: {
  directory: string
  getKey: () => string
  fetcher?: typeof fetch
}) {
  const ledgerPath = (id: string) => join(directory, `${id}.json`)
  const consumed = async (id: string) => {
    try {
      await access(ledgerPath(id))
      return true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw e
    }
  }
  return {
    async status() {
      return {
        configured: Boolean(getKey()),
        limit: places.length,
        used: (await Promise.all(places.map((p) => consumed(p.id)))).filter(Boolean).length,
        consumed: (
          await Promise.all(places.map(async (p) => ((await consumed(p.id)) ? p.id : null)))
        ).filter(Boolean),
      }
    },
    async lookup(id: unknown): Promise<{ photo: PlacePhoto | null; reason: string }> {
      const target = places.find((p) => p.id === id)
      if (!target) throw new PhotoPilotError('写真検証は指定した3店舗だけです。', 404)
      const key = getKey()
      if (!key) throw new PhotoPilotError('Google Places用のAPIキーの設定を待っています。', 503)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      // O_EXCL reserves the one permitted attempt across tabs, processes and restarts.
      let lock
      try {
        lock = await open(ledgerPath(target.id), 'wx', 0o600)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST')
          throw new PhotoPilotError(
            'この店舗の初回検証は実行済みです。追加取得は停止しています。',
            429,
          )
        throw new PhotoPilotError('利用回数を記録できないため、取得を止めました。', 503)
      }
      const usage = {
        schema: 1,
        target: target.id,
        startedAt: new Date().toISOString(),
        state: 'reserved',
        searchCalls: 0,
        photoCalls: 0,
      }
      const record = () =>
        writeFile(ledgerPath(target.id), JSON.stringify(usage) + '\n', { mode: 0o600 })
      try {
        await lock.writeFile(JSON.stringify(usage))
      } finally {
        await lock.close()
      }
      try {
        usage.searchCalls = 1
        await record()
        const result = (await limitedJson(
          await fetcher('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': key,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.photos',
            },
            body: JSON.stringify({
              textQuery: `${target.name} ${target.address}`,
              languageCode: 'ja',
              regionCode: 'JP',
              pageSize: 5,
            }),
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          }),
        )) as { places?: GooglePlace[] }
        const matched = Array.isArray(result.places)
          ? result.places.filter((p) => matchesPlace(target, p))
          : []
        if (matched.length !== 1) {
          usage.state = 'unmatched'
          return {
            photo: null,
            reason: '同じ店舗と一意に確認できなかったため、イラストを表示します。',
          }
        }
        const place = matched[0]
        if (!place.id || !/^[A-Za-z0-9_-]{5,200}$/.test(place.id)) throw new Error('Invalid place')
        const photo = place.photos?.[0]
        if (!photo) {
          usage.state = 'no-photo'
          return { photo: null, reason: '写真が見つからなかったため、イラストを表示します。' }
        }
        // Validate attribution before spending the photo request. No photo metadata is persisted.
        const attribution = decodePlacePhoto({
          imageUrl: 'https://lh3.googleusercontent.com/placeholder',
          sourceUrl: photo.googleMapsUri,
          authors: (photo.authorAttributions ?? []).map((a) => ({
            name: a.displayName,
            url: a.uri,
            avatar: a.photoUri,
          })),
        })
        if (
          typeof photo.name !== 'string' ||
          photo.name.length > 4000 ||
          !new RegExp(`^places/${place.id}/photos/[A-Za-z0-9_-]+$`).test(photo.name)
        )
          throw new Error('Invalid photo reference')
        usage.photoCalls = 1
        await record()
        const media = (await limitedJson(
          await fetcher(
            `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=960&skipHttpRedirect=true`,
            {
              headers: { 'X-Goog-Api-Key': key },
              redirect: 'error',
              signal: AbortSignal.timeout(15_000),
            },
          ),
        )) as { photoUri?: unknown }
        const data = decodePlacePhoto({ ...attribution, imageUrl: media.photoUri })
        usage.state = 'photo-returned'
        return {
          photo: data,
          reason: '店名と所在地を照合しました。写真がこの店舗に合うかご確認ください。',
        }
      } catch (e) {
        usage.state = 'failed'
        if (e instanceof PhotoPilotError) throw e
        // Never echo provider errors, photo names, signed URLs or API credentials.
        throw new PhotoPilotError(
          '写真の取得または出典の確認に失敗しました。イラストを表示します。自動再試行はしません。',
          502,
        )
      } finally {
        await record()
      }
    },
  }
}
