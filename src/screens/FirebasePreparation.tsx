import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { App as NativeApp } from '@capacitor/app'
import {
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { Cloud, LogOut, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { BottomSheet, Chip, Header, Modal, PrimaryButton, Tag } from '../components/ui'
import { firebaseMessage, getFirebaseClient } from '../firebase/client'
import { firebasePilot } from '../firebase/config'
import { draftRepository, slots } from '../firebase/drafts'
import type { CloudDraft } from '../firebase/drafts'
import { colors } from '../sharing/model'
import type { Color } from '../sharing/model'
import { isNativeApp } from '../platform/runtime'
import '../sharing/sharing.css'
import '../firebase/firebase.css'

type Session = { uid: string; email: string; verified: boolean }
const sessionOf = (user: User | null): Session | null =>
  user && {
    uid: user.uid,
    email: user.email ?? '',
    verified: user.emailVerified,
  }

export default function FirebasePreparation({
  shared = false,
  purpose = 'sharing',
  children,
}: {
  shared?: boolean
  purpose?: 'sharing' | 'search'
  children?: (uid: string, busy: boolean) => ReactNode
}) {
  const [{ auth }] = useState(getFirebaseClient)
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(!document.hidden)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const mounted = useRef(false)
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lastMail, setLastMail] = useState(0)
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    mounted.current = true
    const unsub = onAuthStateChanged(auth, (user) => {
      setSession(sessionOf(user))
      setReady(true)
    })
    const hide = () => {
      setActive(false)
      setPassword('')
      setError('')
      setMessage('')
    }
    const visible = () => (document.hidden ? hide() : setActive(true))
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', visible)
    const pause = isNativeApp ? NativeApp.addListener('pause', hide) : null
    const resume = isNativeApp ? NativeApp.addListener('resume', () => setActive(true)) : null
    const tick = setInterval(() => setClock(Date.now()), 1000)
    return () => {
      mounted.current = false
      unsub()
      clearInterval(tick)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', visible)
      void pause?.then((h) => h.remove()).catch(() => {})
      void resume?.then((h) => h.remove()).catch(() => {})
    }
  }, [auth])

  const perform = async (action: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (e) {
      if (mounted.current) setError(firebaseMessage(e))
    } finally {
      running.current = false
      if (mounted.current) {
        setBusy(false)
        setPassword('')
      }
    }
  }
  const verificationMail = async () => {
    const user = auth.currentUser
    if (!user || Date.now() - lastMail < 60_000) return
    await sendEmailVerification(user)
    setLastMail(Date.now())
    setMessage('確認メールを送りました。メール内のリンクを開いてから、この画面へ戻ってください。')
  }
  const authenticate = () =>
    perform(async () => {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim())
        setMessage(
          '対象のアカウントがある場合、再設定メールを送信します。受信箱と迷惑メールを確認してください。',
        )
      } else if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
        await verificationMail()
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    })
  const logout = () =>
    perform(async () => {
      setSession(null)
      setEmail('')
      setPassword('')
      await signOut(auth)
      setMessage('ログアウトしました。端末内の「私の行きたい」はそのまま残っています。')
    })

  return (
    <div className="screen firebase-preparation">
      <Header
        back
        title={
          purpose === 'search' ? 'AI検索の参加・ログイン' : shared ? '行きたいを共有' : '共有の準備'
        }
      />
      <div className="page-pad">
        {((!shared && purpose !== 'search') || !session?.verified) && (
          <>
            <p className="eyebrow teal">OUR NEXT DAY OFF</p>
            <h1>
              {purpose === 'search' ? (
                <>
                  次の休日を、
                  <br />
                  一緒に探そう。
                </>
              ) : (
                <>
                  一緒に出かける、
                  <br />
                  その前に。
                </>
              )}
            </h1>
            <aside className="sharing-demo">
              <strong>
                {firebasePilot?.mode === 'emulator'
                  ? 'ローカル接続テスト'
                  : purpose === 'search'
                    ? '招待された方のAI検索テスト'
                    : 'Firebase接続の検証版'}
              </strong>
              <p>
                {purpose === 'search'
                  ? '招待された方のAI検索テストです。メール確認と参加コードで利用できます。'
                  : shared
                    ? '招待した相手と、選んだ候補だけを共有します。参加にはメール確認と作成者の承認が必要です。'
                    : '自分だけの準備リストです。共有に使う場合は、共有リスト画面で名前と色を選んでコピーできます。'}
              </p>
            </aside>
          </>
        )}
        {!ready && <p role="status">ログイン状態を確認中…</p>}
        {error && (
          <p className="sharing-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="firebase-message" role="status">
            {message}
          </p>
        )}
        {ready && !session && (
          <>
            <p className="body-copy">
              {purpose === 'search'
                ? '共有機能と同じアカウントでログインできます。初めての方は新規登録してください。'
                : '共有に使うアカウントを用意します。個人の保存や学習記録は自動で送信されません。'}
            </p>
            <div className="sharing-actors" aria-label="アカウント操作">
              <Chip
                selected={mode === 'login'}
                disabled={busy}
                onClick={() => {
                  setMode('login')
                  setPassword('')
                  setError('')
                  setMessage('')
                }}
              >
                ログイン
              </Chip>
              <Chip
                selected={mode === 'register'}
                disabled={busy}
                onClick={() => {
                  setMode('register')
                  setPassword('')
                  setError('')
                  setMessage('')
                }}
              >
                新規登録
              </Chip>
            </div>
            {mode === 'reset' && <h2>パスワードの再設定</h2>}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (mode !== 'register' || agreed) void authenticate()
              }}
            >
              <label className="field-label">
                メールアドレス
                <input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
              {mode !== 'reset' && (
                <label className="field-label">
                  パスワード
                  <input
                    aria-label="パスワード"
                    type="password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={mode === 'register' ? 8 : undefined}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                  {mode === 'register' && <small>8文字以上で設定してください。</small>}
                </label>
              )}
              <p className="small muted">
                メールアドレスとパスワードはFirebase
                Authenticationへ送信します。アプリ独自の保存先には記録しません。検証中のログインは画面の再読み込み・アプリ再起動で終了します。
              </p>
              {mode === 'register' && (
                <label className="firebase-consent">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    disabled={busy}
                  />
                  <span>検証用アカウントをFirebaseに作成することを確認しました</span>
                </label>
              )}
              <PrimaryButton
                type="submit"
                icon={Mail}
                disabled={busy || (mode === 'register' && !agreed)}
              >
                {busy
                  ? '処理中…'
                  : mode === 'register'
                    ? '登録して確認メールを送る'
                    : mode === 'reset'
                      ? '再設定メールを送る'
                      : 'メールでログイン'}
              </PrimaryButton>
            </form>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(mode === 'reset' ? 'login' : 'reset')
                setPassword('')
                setError('')
                setMessage('')
              }}
            >
              {mode === 'reset' ? 'ログインに戻る' : 'パスワードを忘れた方'}
            </button>
          </>
        )}
        {session && (
          <>
            <div className="firebase-account">
              <Mail size={18} />
              <span>{session.email}</span>
            </div>
            {!session.verified && (
              <>
                <h2>メールアドレスを確認しましょう</h2>
                <p className="body-copy">
                  確認メールのリンクを開き、ここへ戻って下のボタンを押してください。確認が終わるまで、
                  {purpose === 'search'
                    ? 'AI検索はできません。'
                    : 'リストの保存・取得は行いません。'}
                </p>
                <PrimaryButton
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const user = auth.currentUser
                      if (!user) return
                      await reload(user)
                      await getIdToken(user, true)
                      setSession(sessionOf(user))
                      if (!user.emailVerified)
                        setMessage(
                          'メール確認がまだ完了していません。メールのリンクを開いてからお試しください。',
                        )
                    })
                  }
                >
                  メールの確認ができました
                </PrimaryButton>
                <PrimaryButton
                  variant="secondary"
                  disabled={busy || clock - lastMail < 60_000}
                  onClick={() => void perform(verificationMail)}
                >
                  {clock - lastMail < 60_000
                    ? '確認メールを送信済み（再送まで少しお待ちください）'
                    : '確認メールを再送する'}
                </PrimaryButton>
              </>
            )}
            {session.verified && active && (
              <section key={session.uid}>
                {children ? (
                  children(session.uid, busy)
                ) : (
                  <Drafts uid={session.uid} parentBusy={busy} />
                )}
              </section>
            )}
            {session.verified && !active && (
              <p role="status">アプリへ戻ると最新の内容を読み直します。</p>
            )}
            <PrimaryButton
              variant="ghost"
              icon={LogOut}
              disabled={busy}
              onClick={() => void logout()}
            >
              ログアウト
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  )
}

function Drafts({ uid, parentBusy }: { uid: string; parentBusy: boolean }) {
  const [{ auth, db }] = useState(getFirebaseClient)
  const [repo] = useState(() => draftRepository(db, uid))
  const [lists, setLists] = useState<CloudDraft[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editor, setEditor] = useState<{ id: string; revision: number | null } | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<Color>('teal')
  const [removing, setRemoving] = useState<CloudDraft | null>(null)
  const running = useRef(false)
  const alive = useRef(false)
  const valid = () => alive.current && auth.currentUser?.uid === uid && !document.hidden
  const read = async () => {
    const next = await repo.read()
    if (valid()) {
      setLists(next)
      setReady(true)
    }
  }
  const perform = async (action: () => Promise<void>) => {
    if (running.current || parentBusy) return
    running.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (e) {
      if (valid()) {
        setLists([])
        setReady(false)
        setError(firebaseMessage(e))
      }
    } finally {
      running.current = false
      if (alive.current) setBusy(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void perform(read)
    return () => {
      alive.current = false
    }
    // Repository and uid stay fixed for this keyed session.
  }, [])
  const edit = (draft?: CloudDraft) => {
    const id = draft?.id ?? slots.find((s) => !lists.some((d) => d.id === s))
    if (!id) return
    setName(draft?.name ?? '')
    setColor(draft?.color ?? 'teal')
    setEditor({ id, revision: draft?.revision ?? null })
    setError('')
    setMessage('')
  }
  return (
    <section aria-label="クラウドのリスト">
      <div className="sharing-toolbar">
        <h2>クラウドに保存したリスト</h2>
        <Tag>本人のみ</Tag>
      </div>
      <p className="small muted">
        リストの名前・色と作成者ID・更新日時をFirebaseに保存します。相手との候補共有は「共有リスト」画面から行います。
      </p>
      {busy && <p role="status">保存先と通信中…</p>}
      {error && (
        <p className="sharing-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="firebase-message" role="status">
          {message}
        </p>
      )}
      {ready && !lists.length && (
        <p className="body-copy">まだリストはありません。最初のリストを作りましょう。</p>
      )}
      {lists.map((draft) => (
        <article className={`sharing-list-tile sharing-color-${draft.color}`} key={draft.id}>
          <Cloud size={22} />
          <span>
            <strong>{draft.name}</strong>
            <small>Firebaseに保存済み・本人のみ</small>
          </span>
          <button
            className="text-button"
            disabled={busy || parentBusy}
            aria-label={`${draft.name}を編集`}
            onClick={() => edit(draft)}
          >
            編集
          </button>
          <button
            className="icon-button"
            disabled={busy || parentBusy}
            aria-label={`${draft.name}を削除`}
            onClick={() => setRemoving(draft)}
          >
            <Trash2 size={18} />
          </button>
        </article>
      ))}
      <PrimaryButton
        icon={Plus}
        disabled={!ready || busy || parentBusy || lists.length >= 3}
        onClick={() => edit()}
      >
        クラウドにリストを作る
      </PrimaryButton>
      <p className="small muted">検証中は3つまで作れます。</p>
      <PrimaryButton
        icon={RefreshCw}
        variant="secondary"
        disabled={busy || parentBusy}
        onClick={() => void perform(read)}
      >
        最新の内容を読み直す
      </PrimaryButton>
      {editor && (
        <BottomSheet title="保存するリスト" onClose={() => !busy && setEditor(null)}>
          <p className="body-copy">
            この名前と色をFirebaseに保存します。端末内の個人データは追加されません。
          </p>
          <label className="field-label">
            リストの名前
            <input
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="次の休日、友だちと行きたい場所…"
            />
          </label>
          <p className="field-label">リストの色</p>
          <div className="sharing-colors">
            {Object.entries(colors).map(([key, label]) => (
              <Chip
                className={`sharing-color-${key}`}
                key={key}
                selected={key === color}
                disabled={busy}
                onClick={() => setColor(key as Color)}
              >
                {label}
              </Chip>
            ))}
          </div>
          {error && (
            <p role="alert" className="sharing-error">
              {error}
            </p>
          )}
          <PrimaryButton
            disabled={busy || parentBusy || !name.trim()}
            onClick={() =>
              void perform(async () => {
                await repo.save(editor.id, name, color, editor.revision)
                if (!valid()) return
                setEditor(null)
                setMessage('保存しました。')
                await read()
              })
            }
          >
            {busy ? '保存中…' : 'Firebaseに保存する'}
          </PrimaryButton>
        </BottomSheet>
      )}
      {removing && (
        <Modal title="リストを削除" onClose={() => !busy && setRemoving(null)}>
          <p className="body-copy">「{removing.name}」をFirebaseから削除します。</p>
          {error && (
            <p role="alert" className="sharing-error">
              {error}
            </p>
          )}
          <PrimaryButton
            variant="danger"
            disabled={busy || parentBusy}
            onClick={() =>
              void perform(async () => {
                await repo.remove(removing)
                if (!valid()) return
                setRemoving(null)
                setMessage('削除しました。')
                await read()
              })
            }
          >
            このリストを削除する
          </PrimaryButton>
        </Modal>
      )}
    </section>
  )
}
