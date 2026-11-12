import { useApp } from '../state/AppState'
import { hiddenSpotRecord, sameHiddenSpot, MAX_HIDDEN_SPOTS } from '../domain/hiddenSpots'
import type { HiddenWebSpot } from '../domain/hiddenSpots'
import type { WebSpot } from '../domain/webSearch'

export function useHiddenSpots() {
  const {
    state,
    updateAndSave,
    toast,
    storageProtected,
    storageError,
    storagePending,
    memoryOnly,
  } = useApp()
  const restore = async (spot: HiddenWebSpot) => {
    const saved = await updateAndSave((s) => ({
      ...s,
      hiddenWebSpots: s.hiddenWebSpots.filter((item) => !sameHiddenSpot(item, spot)),
    }))
    toast(
      saved
        ? '再び候補に表示できるようにしました'
        : '変更を保存できませんでした。保存の状態を確認してください。',
    )
    requestAnimationFrame(() =>
      document.getElementById('app-scroll')?.focus({ preventScroll: true }),
    )
  }
  const hide = async (spot: WebSpot) => {
    if (storageProtected || storageError || storagePending) return
    if (state.hiddenWebSpots.length >= MAX_HIDDEN_SPOTS) {
      toast('非表示の一覧がいっぱいです。マイページから不要な設定を戻してください。')
      return
    }
    const record = hiddenSpotRecord(spot)
    const saved = await updateAndSave((s) => ({
      ...s,
      hiddenWebSpots: s.hiddenWebSpots.some((item) => sameHiddenSpot(item, record))
        ? s.hiddenWebSpots
        : [...s.hiddenWebSpots, record],
    }))
    toast(
      saved
        ? memoryOnly
          ? 'この確認画面の候補から非表示にしました'
          : '候補から非表示にしました'
        : '非表示の変更を保存できませんでした。保存の状態を確認してください。',
      {
        label: '元に戻す',
        run: () => {
          void restore(record)
        },
      },
    )
  }
  return { hide, restore, disabled: storageProtected || storageError || storagePending }
}
