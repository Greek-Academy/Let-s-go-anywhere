import type { CapacitorConfig } from '@capacitor/cli'
import { KeyboardResize } from '@capacitor/keyboard'

const variant = process.env.DRIVEPLUS_IOS_VARIANT ?? 'preview'
if (!['preview', 'firebase'].includes(variant)) throw new Error('Unsupported iOS build variant')

const config: CapacitorConfig = {
  appId: 'org.greekacademy.driveplus.mock',
  appName: 'Drive+ Mock',
  webDir: variant === 'firebase' ? 'firebase-dist' : 'dist',
  loggingBehavior: 'none',
  // Bundle the built sample app. Never require a developer's LAN server at runtime.
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
  plugins: { Keyboard: { resize: KeyboardResize.Native } },
}

export default config
