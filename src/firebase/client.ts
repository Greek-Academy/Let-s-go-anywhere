import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { firebasePilot } from './config'

function createClient() {
  if (!firebasePilot) throw new Error('共有接続の検証版は準備中です。')
  if (firebasePilot.mode === 'emulator' && !['127.0.0.1', 'localhost'].includes(location.hostname))
    throw new Error('ローカル検証専用のビルドです。')
  const app = initializeApp(firebasePilot, 'driveplus-sharing-pilot')
  const auth = initializeAuth(app, { persistence: inMemoryPersistence })
  auth.languageCode = 'ja'
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
  })
  if (firebasePilot.mode === 'emulator') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8086)
  }
  return { auth, db }
}
// Called only after explicitly opening the cloud preparation screen, never during app startup.
let client: ReturnType<typeof createClient> | undefined
export function getFirebaseClient() {
  return (client ??= createClient())
}
export async function signOutFirebaseIfStarted() {
  if (client) await signOut(client.auth)
}

export function firebaseMessage(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === 'permission-denied')
    return '保存先へのアクセスが許可されていません。メール確認と、検証用の権限ルールの設定を確認してください。'
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  )
    return 'メールアドレスまたはパスワードを確認してください。'
  if (code === 'auth/email-already-in-use')
    return '登録できませんでした。登録済みの場合はログインまたはパスワード再設定をお試しください。'
  if (code === 'auth/weak-password') return 'パスワードは8文字以上で入力してください。'
  if (code === 'auth/invalid-email') return 'メールアドレスの形式を確認してください。'
  if (code === 'auth/too-many-requests' || code === 'resource-exhausted')
    return '利用回数の制限に達しました。時間をおいてお試しください。'
  if (code === 'auth/requires-recent-login') return 'もう一度ログインしてから操作してください。'
  if (code === 'unavailable' || code === 'auth/network-request-failed')
    return '通信できませんでした。接続を確認してお試しください。'
  if (error instanceof DraftConflict) return error.message
  return '処理を完了できませんでした。内容を読み直して、もう一度お試しください。'
}
export class DraftConflict extends Error {}
