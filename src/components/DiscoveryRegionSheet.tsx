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
    gps.enabled ? 'location' : value === 'origin' && origin ? 'origin' : 'station',
  )
  const [chosen, setChosen] = useState<string | null>(railStation(stationId)?.id ?? null)
  return (
    <BottomSheet title="探す地域を変更" onClose={onClose}>
      <p className="body-copy">
        駅や現在地を起点に、お店・スポットを探せます。出発駅とは別に指定できます。
      </p>
      <div className="region-choices">
        {origin && (
          <Choice
            title="出発駅の周辺"
            description={stationLabel(origin)}
            selected={mode === 'origin'}
            onClick={() => {
              gps.cancel()
              setMode('origin')
            }}
          />
        )}
        {!origin && (
          <p className="small muted">出発駅はまだ未設定です。ここで探したい駅を指定できます。</p>
        )}
        <Choice
          title="別の駅の周辺"
          description="駅名を入力して選ぶ"
          selected={mode === 'station'}
          onClick={() => {
            gps.cancel()
            setMode('station')
          }}
        />
        <Choice
          title="現在地の周辺"
          description="位置情報を取得して探す"
          selected={mode === 'location'}
          onClick={() => setMode('location')}
        />
        {mode === 'location' && (
          <div className="notice discovery-location-notice">
            <p>
              許可したときだけ一度取得します。位置は約100m単位に丸め、次の画面で「Webで候補を探す」を押すとOpenAI・Anthropicへ送信します。
            </p>
            <p className="small muted">
              座標は端末や検索結果の保管先に保存せず、共有しません。10分経過・アプリを閉じると再取得が必要です。送信先での扱いは各社のデータポリシーに従います。
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
        選んだ地点の周辺約2kmを目安に探します。候補までの実際の距離・所要時間は未確認です。
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
          この駅の周辺で探す
        </PrimaryButton>
      )}
    </BottomSheet>
  )
}
