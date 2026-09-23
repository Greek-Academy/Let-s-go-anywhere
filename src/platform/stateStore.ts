import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from './runtime'

// Browser state and iOS state are intentionally separate. There is no cloud sync.
export const stateStore = {
  getItem: async (key: string): Promise<string | null> =>
    isNativeApp ? (await Preferences.get({ key })).value : localStorage.getItem(key),
  setItem: async (key: string, value: string): Promise<void> => {
    if (isNativeApp) await Preferences.set({ key, value })
    else localStorage.setItem(key, value)
  },
  removeItem: async (key: string): Promise<void> => {
    if (isNativeApp) await Preferences.remove({ key })
    else localStorage.removeItem(key)
  },
}
