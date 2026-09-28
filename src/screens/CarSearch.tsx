import { useState } from 'react'
import { CarFront, ChevronRight, ExternalLink, MapPin, Search } from 'lucide-react'
import { carProviders } from '../data/carProviders'
import type { StationType } from '../data/types'
import { carSearchAreaError } from '../domain/carSearch'
import type { CarSearchRequest } from '../domain/carSearch'
import { useApp } from '../state/AppState'
import { Chip, Header, PrimaryButton, Tag, useBack } from '../components/ui'
import { ExternalModal } from '../components/ExternalLinkModal'

export function CarSearch() {
  const { state, update } = useApp()
  const back = useBack('/cars')
  const conditions = state.carSearch
  const area = conditions.area ?? state.profile.area
  const providers = carProviders.filter(
    (item) => conditions.type === 'すべて' || item.type === conditions.type,
  )
  const selected = providers.find((item) => item.id === conditions.provider)
  const [error, setError] = useState<string | null>(null)
  const [external, setExternal] = useState<{ title: string; request: CarSearchRequest } | null>(
    null,
  )
  const change = (patch: Partial<typeof conditions>) => {
    update((s) => ({ ...s, carSearch: { ...s.carSearch, ...patch } }))
    setError(null)
  }
  const search = () => {
    const problem = carSearchAreaError(area)
    setError(problem)
    if (problem) return
    change({ area: area.trim() })
    setExternal({
      title: `${area.trim()} · ${selected?.name ?? (conditions.type === 'すべて' ? 'レンタカー・カーシェア' : conditions.type)}`,
      request: {
        type: 'car-search',
        target: 'map',
        area: area.trim(),
        service: conditions.type,
        provider: conditions.provider,
      },
    })
  }
  return (
    <div className="screen car-search-screen">
      <Header back={back} title="実際の車を探す" />
      <div className="page-pad">
        <h1>借りる場所を探す</h1>
        <p className="body-copy">駅・地域から、外部地図や公式サイトで車を探せます。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            search()
          }}
          className="car-search-form"
        >
          <label className="field-label" htmlFor="real-car-area">
            探す駅・地域
          </label>
          <div className="car-area-input">
            <Search size={19} aria-hidden="true" />
            <input
              id="real-car-area"
              value={area}
              placeholder="例：京都駅、東京都 渋谷駅"
              maxLength={80}
              enterKeyHint="search"
              aria-invalid={!!error}
              aria-describedby={error ? 'car-area-error' : undefined}
              onChange={(event) => change({ area: event.target.value })}
            />
          </div>
          {error && (
            <p className="notice" role="alert" id="car-area-error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="text-button car-use-origin"
            onClick={() => change({ area: state.profile.area })}
          >
            <MapPin size={14} />
            出発エリアを使う：{state.profile.area || '未設定'}
          </button>
          <h2 className="filter-heading">サービスの種類</h2>
          <div className="chips">
            {(['すべて', 'レンタカー', 'カーシェア'] as StationType[]).map((type) => (
              <Chip
                key={type}
                selected={conditions.type === type}
                onClick={() => change({ type, provider: null })}
              >
                {type}
              </Chip>
            ))}
          </div>
          <label className="field-label car-provider-label" htmlFor="car-provider">
            事業者
          </label>
          <select
            id="car-provider"
            value={conditions.provider ?? ''}
            onChange={(event) =>
              change({
                provider: providers.find((item) => item.id === event.target.value)?.id ?? null,
              })
            }
          >
            <option value="">指定しない</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <PrimaryButton type="submit" icon={MapPin}>
            外部地図で車を探す
          </PrimaryButton>
          <p className="small muted">
            Googleマップへ検索語を渡します。次の画面で移動先を確認できます。
          </p>
        </form>
        <section className="car-official-section" aria-labelledby="car-official-title">
          <h2 id="car-official-title">公式サイトから探す</h2>
          <p className="body-copy small">
            空き状況・料金・利用条件は公式で。
            <br />
            地域・日時は公式サイトで入力してください。
          </p>
          <div className="car-provider-list">
            {(selected ? [selected] : providers).map((provider) => (
              <button
                key={provider.id}
                className="car-provider-card"
                onClick={() =>
                  setExternal({
                    title: provider.name,
                    request: { type: 'car-search', target: 'provider', provider: provider.id },
                  })
                }
              >
                <span
                  className={`car-provider-symbol ${provider.type === 'レンタカー' ? 'rental' : ''}`}
                >
                  <CarFront size={23} aria-hidden="true" />
                </span>
                <span className="car-provider-copy">
                  <Tag tone={provider.type === 'レンタカー' ? 'blue' : 'mint'}>{provider.type}</Tag>
                  <strong>{provider.name}</strong>
                  <span>
                    公式の検索ページ <ExternalLink size={11} aria-hidden="true" />
                  </span>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
        <p className="car-search-note small muted">
          この画面では拠点・空き状況を取得しません。外部の検索結果はアプリに取り込まれず、予約も確定しません。
        </p>
      </div>
      {external && (
        <ExternalModal
          title={external.title}
          request={external.request}
          onClose={() => setExternal(null)}
        />
      )}
    </div>
  )
}
