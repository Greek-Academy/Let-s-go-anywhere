import type { CapacitorConfig } from '@capacitor/cli'
import { KeyboardResize } from '@capacitor/keyboard'

const config: CapacitorConfig = {
  appId: 'org.greekacademy.driveplus.mock',
  appName: 'Drive+ Mock',
  webDir: 'dist',
  loggingBehavior: 'none',
  // Bundle the built sample app. Never require a developer's LAN server at runtime.
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
  plugins: { Keyboard: { resize: KeyboardResize.Native } },
}

export default config
