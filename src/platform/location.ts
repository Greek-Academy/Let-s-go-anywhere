import { Geolocation } from '@capacitor/geolocation'
import type { Position } from '@capacitor/geolocation'
import type { LocationFix } from '../domain/nearbyStations'
import { isNativeApp } from './runtime'

class StalePositionError extends Error {
  constructor() {
    super(
      '古い位置情報が返されました。新しい位置を確認できないため、地域名から探すか位置情報の設定を確認してください。',
    )
  }
}

export function validatePosition(position: Position, now = Date.now()): LocationFix {
  const { latitude: lat, longitude: lng, accuracy } = position.coords
  if (
    ![lat, lng, accuracy, position.timestamp].every(Number.isFinite) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    accuracy < 0
  )
    throw new Error('位置を確認できませんでした。地域名から探してください。')
  if (position.timestamp < now - 120000) throw new StalePositionError()
  if (position.timestamp > now + 10000)
    throw new Error(
      '位置情報の時刻が端末の時刻より先になっています。端末の日時設定を確認するか、地域名から探してください。',
    )
  if (accuracy > 1000)
    throw new Error(
      '位置の誤差が大きいため周辺を絞れません。地域名から探すか、端末の「正確な位置情報」を確認して再取得してください。',
    )
  if (lat < 20 || lat > 46 || lng < 122 || lng > 154)
    throw new Error('取得した位置は国内の地図表示範囲外です。地域名から探してください。')
  return { lat, lng, accuracy, timestamp: position.timestamp }
}

export function locationError(error: unknown): string {
  const code = (error as { code?: string | number } | null)?.code
  if (code === 1 || code === 'OS-PLUG-GLOC-0003')
    return '位置情報が許可されていません。地域名から探せます。利用する場合は端末・ブラウザの設定で許可してください。'
  if (code === 3 || code === 'OS-PLUG-GLOC-0010')
    return '位置の取得が時間切れになりました。再取得するか、地域名から探してください。'
  if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0008')
    return '端末の位置情報サービスがオフ、または利用が制限されています。地域名から探せます。'
  return '現在地を取得できませんでした。通信・位置情報の設定を確認するか、地域名から探してください。'
}

/** One user action, at most one stale-fix retry, no watch or background requests. */
export async function locateOnce(signal?: AbortSignal): Promise<LocationFix> {
  if (!isNativeApp && (!window.isSecureContext || !navigator.geolocation))
    throw new Error(
      'この接続では現在地を取得できません。HTTPS・Macのlocalhost・iPhoneアプリで利用するか、地域名から探してください。',
    )
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let onAbort: (() => void) | undefined
  const assertActive = () => {
    if (stopped || signal?.aborted || document.hidden)
      throw new DOMException('Location request cancelled', 'AbortError')
  }
  const request = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      assertActive()
      let position: Position
      try {
        position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      } catch (error) {
        throw new Error(locationError(error))
      }
      // The native request itself cannot be aborted. Never use its late result,
      // or start another request after cancelling/backgrounding/the deadline.
      assertActive()
      try {
        return validatePosition(position)
      } catch (error) {
        if (!(error instanceof StalePositionError) || attempt === 1) throw error
      }
    }
    throw new StalePositionError()
  }
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(locationError({ code: 3 }))), 30000)
      onAbort = () => reject(new DOMException('Location request cancelled', 'AbortError'))
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    return await Promise.race([request(), deadline])
  } finally {
    stopped = true
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
}
