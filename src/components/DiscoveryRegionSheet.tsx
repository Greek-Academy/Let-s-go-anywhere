import { useState } from 'react'
import { prefectures } from '../data/regions'
import type { DiscoveryRegion, Prefecture } from '../data/regions'
import { originPrefecture } from '../domain/discoveryRegion'
import { BottomSheet, Choice, PrimaryButton } from './ui'

export function DiscoveryRegionSheet({
  value,
  origin,
  available,
  onSave,
  onClose,
}: {
  value: DiscoveryRegion
  origin: string
  available: Prefecture[]
  onSave: (value: DiscoveryRegion) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const samePrefecture = originPrefecture(origin)
  const [chosen, setChosen] = useState<Prefecture>(
    value !== 'origin' && value !== 'all' ? value : (samePrefecture ?? '東京都'),
  )
  const specific = draft !== 'origin' && draft !== 'all'
  return (
    <BottomSheet title="探す地域を変更" onClose={onClose}>
      <p className="body-copy">
        お出かけ先の都道府県を選びます。出発地「{origin || '未設定'}」は変わりません。
      </p>
      <div className="region-choices">
        <Choice
          title="出発エリアと同じ都道府県"
          description={samePrefecture ?? '都道府県を判別できません。地域を指定して探せます。'}
          selected={draft === 'origin'}
          onClick={() => setDraft('origin')}
        />
        <Choice
          title="地域を指定する"
          description="行ってみたい都道府県から探す"
          selected={specific}
          onClick={() => setDraft(chosen)}
        />
        {specific && (
          <label className="field-label region-select-field">
            目的地の都道府県
            <select
              value={draft}
              onChange={(e) => {
                const next = e.target.value as Prefecture
                setChosen(next)
                setDraft(next)
              }}
            >
              {prefectures.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        <Choice
          title="すべての地域"
          description="地域で絞り込まず、掲載中の候補を見る"
          selected={draft === 'all'}
          onClick={() => setDraft('all')}
        />
      </div>
      <p className="small muted region-coverage">
        {available.length
          ? `いま表示できるサンプルの地域：${available.join('・')}。`
          : 'いま表示できるサンプルはありません。'}
        距離・所要時間・運転のしやすさで選ぶものではありません。
      </p>
      <PrimaryButton
        onClick={() => {
          onSave(draft)
          onClose()
        }}
      >
        この地域で探す
      </PrimaryButton>
    </BottomSheet>
  )
}
