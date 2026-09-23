import { useState } from 'react'
import type { MouseEvent } from 'react'
import { ArrowUpRight, Globe, ExternalLink } from 'lucide-react'
import { Modal, PrimaryButton } from './ui'
import { useContentTime } from '../content/ContentProvider'
import { japanDate } from '../domain/dates'
import { evaluateExternalRequest, linkBlockMessages } from '../domain/externalLinks'
import type { Destination, ExternalKind, ExternalRequest } from '../domain/externalLinks'
import { useApp } from '../state/AppState'
import { Browser } from '@capacitor/browser'
import { isNativeApp } from '../platform/runtime'

export function ExternalModal({
  title,
  onClose,
  kind = 'official',
  request,
}: {
  title: string
  onClose: () => void
  kind?: ExternalKind
  request?: ExternalRequest
}) {
  const effectiveRequest: ExternalRequest = request ?? {
    type: 'listing',
    catalogSource: 'sample',
    kind,
  }
  const now = useContentTime()
  const [, refresh] = useState(0)
  const [help, setHelp] = useState(false)
  const [openError, setOpenError] = useState(false)
  const { storageError } = useApp()
  const decision = evaluateExternalRequest(effectiveRequest, japanDate(now))
  const label =
    decision.kind === 'map'
      ? '地図で所在地を確認'
      : decision.kind === 'sns'
        ? '元のページを開く'
        : '公式Webで確認する'
  const guard = (event: MouseEvent<HTMLAnchorElement>, destination: Destination) => {
    // Check again on activation; a time/focus update may not have run yet.
    const current = evaluateExternalRequest(effectiveRequest)
    if (
      ![current.destination, current.app, current.fallback].some((d) => d?.url === destination.url)
    ) {
      event.preventDefault()
      refresh((n) => n + 1)
      return
    }
    if (isNativeApp) {
      event.preventDefault()
      if (event.type !== 'click') return
      setOpenError(false)
      // Keep the bundled app in its WebView; close the system browser to return.
      void Browser.open({ url: destination.url, toolbarColor: '#ffffff' }).catch(() => {
        setOpenError(true)
      })
    }
  }
  const link = (destination: Destination, text: string, sameTab = false, secondary = false) => (
    <a
      className={`button button-${secondary ? 'secondary' : 'primary'}`}
      href={destination.url}
      target={sameTab ? '_self' : '_blank'}
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      onClick={(e) => guard(e, destination)}
      onAuxClick={(e) => guard(e, destination)}
      onContextMenu={(e) => guard(e, destination)}
    >
      <ExternalLink size={17} aria-hidden="true" />
      <span>{text}</span>
    </a>
  )
  return (
    <Modal
      title={
        decision.kind === 'map'
          ? '外部地図へのご案内'
          : decision.kind === 'sns'
            ? '元の投稿へのご案内'
            : '公式サービスへのご案内'
      }
      onClose={onClose}
    >
      <div className="external-symbol">
        <ArrowUpRight size={34} />
      </div>
      <h3 className="external-title">{title}</h3>
      {effectiveRequest.type === 'personal' && (
        <p className="body-copy">本人が保存したリンクです。内容・開催情報は未確認です。</p>
      )}
      {decision.destination ? (
        <>
          <div className="external-destination">
            <span className="small muted">移動先</span>
            <strong>
              <Globe size={15} aria-hidden="true" />
              {decision.destination.host}
            </strong>
            <p>{decision.destination.url}</p>
            {decision.destination.checkedAt && (
              <small>リンク確認日：{decision.destination.checkedAt}</small>
            )}
          </div>
          <p className="body-copy">
            {isNativeApp
              ? 'ブラウザ画面で開きます。ブラウザ画面を閉じると、この画面の続きに戻れます。'
              : '別タブ、または対応するアプリで開きます。元のタブから続きに戻れます。'}
          </p>
          {decision.kind === 'map' && (
            <p className="small muted">
              所在地を地図に渡します。車の入口や走りやすさを保証する案内ではありません。
            </p>
          )}
          {link(decision.destination, label)}
          {decision.app && !isNativeApp && (
            <>
              <p className="small muted external-app-host">アプリ用リンク：{decision.app.host}</p>
              {link(decision.app, '対応アプリのリンクを開く', false, true)}
            </>
          )}
          <button
            className="text-button external-help"
            onClick={() => setHelp(!help)}
            aria-expanded={help}
          >
            開けない・アプリがないとき
          </button>
          {help && (
            <div className="external-help-content">
              <p className="body-copy">
                アプリがない場合はWebで確認してください。削除・移転・ログインが必要なページは、元のサービスで確認できます。このアプリでは接続先の応答を確認していません。
              </p>
              {isNativeApp ? (
                <p className="small muted">
                  通信状態を確認して、もう一度お試しください。表示したURLは長押しでコピーできます。
                </p>
              ) : storageError ? (
                <p className="notice">保存領域が使えないため、元のタブを残して開いてください。</p>
              ) : (
                <>
                  <p className="small muted">
                    同じタブで開いた後は、ブラウザの「戻る」で戻れます。
                  </p>
                  {link(
                    decision.destination,
                    decision.kind === 'official' ? '同じタブで公式Webを開く' : '同じタブで開く',
                    true,
                    true,
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="notice" role="status">
          {linkBlockMessages[decision.block ?? 'unconfirmed']}
        </div>
      )}
      {decision.fallback && (
        <div className="external-fallback">
          <p className="small muted">別の確認先：{decision.fallback.host}</p>
          {link(decision.fallback, '公式Webで確認する', false, true)}
        </div>
      )}
      {openError && (
        <p className="notice" role="alert">
          ブラウザ画面を開けませんでした。もう一度お試しください。
        </p>
      )}
      <p className="small muted external-disclosure">
        リンクを開くだけでは予約・問い合わせは完了しません。料金・空き状況・利用条件は提供元で確認してください。
      </p>
      {decision.destination && (
        <p className="small muted">
          表示したURLを開きます。プロフィール・学習回答・相談メモをURLに追加しません。
        </p>
      )}
      <PrimaryButton variant="secondary" onClick={onClose}>
        アプリに戻る
      </PrimaryButton>
    </Modal>
  )
}
