import { useDiscoveryLocation } from '../state/DiscoveryLocationState'
import { useEffect, useState } from 'react'
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
  const gps = useDiscoveryLocation()
  useEffect(() => () => gps.cancel(), [gps.cancel])
  const origin = railStation(originId)
  const [mode, setMode] = useState<'origin' | 'station' | 'location'>(
    gps.enabled || (!origin && !stationId)
      ? 'location'
      : value === 'origin' && origin
        ? 'origin'
        : 'station',
  )
  const [chosen, setChosen] = useState<string | null>(railStation(stationId)?.id ?? null)
  return (
    <BottomSheet title="探す地域を変更" onClose={onClose}>
      <p className="body-copy">
        現在地をドライブの出発地にできます。位置情報を使わない場合は、駅を出発地に指定できます。
      </p>
      <div className="region-choices">
        {origin && (
          <Choice
            title="保存した駅から出発"
            description={stationLabel(origin)}
            selected={mode === 'origin'}
            onClick={() => {
              gps.cancel()
              setMode('origin')
            }}
          />
        )}
        <Choice
          title="駅を出発地にする"
          description="駅名を入力して選ぶ"
          selected={mode === 'station'}
          onClick={() => {
            gps.cancel()
            setMode('station')
          }}
        />
        <Choice
          title="現在地から出発"
          description="位置情報を取得して探す"
          selected={mode === 'location'}
          onClick={() => setMode('location')}
        />
        {mode === 'location' && (
          <div className="notice discovery-location-notice">
            <p>
              許可したときだけ一度取得します。位置は約100m単位に丸め、ホームの検索ボタンを押したときにOpenAI・Anthropicへ、経路計算が有効な場合はGoogle
              Mapsへ送ります。
            </p>
            <p className="small muted">
              座標は端末や検索結果の保管先に保存せず、共有しません。取得から10分間だけメモリ内で利用します。一時的なタブ・アプリの切り替えでは検索を続け、再読み込みや終了で位置を破棄します。送信先での扱いは各社のデータポリシーに従います。
            </p>
            {gps.error && (
              <p className="field-error" role="alert">
                {gps.error}
              </p>
            )}
          </div>
        )}
        {mode === 'station' && (
          <StationPicker label="探したい駅" value={chosen} onChange={setChosen} />
        )}
      </div>
      <p className="small muted">
        この操作では出発地だけを設定します。行き先はホームの検索ボタンから探せます。
      </p>
      {mode === 'location' ? (
        <PrimaryButton
          disabled={gps.loading}
          onClick={async () => {
            if (await gps.locate()) onClose()
          }}
        >
          {gps.loading ? '現在地を取得中…' : '現在地を取得して設定'}
        </PrimaryButton>
      ) : (
        <PrimaryButton
          disabled={mode === 'origin' ? !origin : !railStation(chosen)}
          onClick={() => {
            gps.reset()
            onSave(mode, mode === 'station' ? chosen : null)
            onClose()
          }}
        >
          この駅を出発地にする
        </PrimaryButton>
      )}
    </BottomSheet>
  )
}
