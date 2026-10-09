import { useState } from 'react'
import type { DiscoveryRegion } from '../data/regions'
import { railStation, stationLabel } from '../domain/railStations'
import { StationPicker } from './StationPicker'
import { BottomSheet, Choice, PrimaryButton } from './ui'

export function DiscoveryRegionSheet({
  value,
  stationId,
  originId,
  onSave,
  onClose,
}: {
  value: DiscoveryRegion
  stationId?: string | null
  originId?: string | null
  onSave: (region: 'origin' | 'station', stationId: string | null) => void
  onClose: () => void
}) {
  const origin = railStation(originId)
  const [mode, setMode] = useState<'origin' | 'station'>(
    value === 'origin' && origin ? 'origin' : 'station',
  )
  const [chosen, setChosen] = useState<string | null>(railStation(stationId)?.id ?? null)
  return (
    <BottomSheet title="探す駅を変更" onClose={onClose}>
      <p className="body-copy">
        お店やスポットを探したい駅を選びます。出発駅とは別に指定できます。
      </p>
      <div className="region-choices">
        {origin && (
          <Choice
            title="出発駅の周辺"
            description={stationLabel(origin)}
            selected={mode === 'origin'}
            onClick={() => setMode('origin')}
          />
        )}
        {!origin && (
          <p className="small muted">出発駅はまだ未設定です。ここで探したい駅を指定できます。</p>
        )}
        <Choice
          title="別の駅の周辺"
          description="駅名を入力して選ぶ"
          selected={mode === 'station'}
          onClick={() => setMode('station')}
        />
        {mode === 'station' && (
          <StationPicker label="探したい駅" value={chosen} onChange={setChosen} />
        )}
      </div>
      <p className="small muted">
        駅周辺の約2kmを目安に探します。候補までの実際の距離・所要時間は未確認です。
      </p>
      <PrimaryButton
        disabled={mode === 'origin' ? !origin : !railStation(chosen)}
        onClick={() => {
          onSave(mode, mode === 'station' ? chosen : null)
          onClose()
        }}
      >
        この駅の周辺で探す
      </PrimaryButton>
    </BottomSheet>
  )
}
