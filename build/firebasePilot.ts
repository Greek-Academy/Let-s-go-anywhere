export interface FirebasePilotConfig {
  mode: 'firebase' | 'emulator'
  apiKey: string
  projectId: string
  authDomain: string
  appId: string
}

/** Explicit opt-in build modes. Never expose unrelated environment variables. */
export function resolveFirebasePilot(
  mode: string,
  env: Record<string, string | undefined>,
): FirebasePilotConfig | null {
  if (mode === 'emulator') {
    return {
      mode,
      apiKey: 'demo-driveplus-public-key',
      projectId: 'demo-driveplus',
      authDomain: 'demo-driveplus.firebaseapp.com',
      appId: '1:123:web:emulator',
    }
  }
  if (mode !== 'firebase') return null
  const apiKey = env.DRIVEPLUS_FIREBASE_API_KEY ?? ''
  const appId = env.DRIVEPLUS_FIREBASE_APP_ID ?? ''
  const projectId = env.DRIVEPLUS_FIREBASE_PROJECT_ID ?? ''
  // This pilot cannot silently point at another (possibly production) project.
  if (
    projectId !== 'driveplus-fbc33' ||
    !/^AIza[\w-]{35}$/.test(apiKey) ||
    !/^1:664306107477:web:[a-f0-9]+$/.test(appId)
  ) {
    throw new Error('Firebase pilot settings are missing or do not match the approved project.')
  }
  return { mode, apiKey, appId, projectId, authDomain: `${projectId}.firebaseapp.com` }
}

export function firebaseConnectSources(config: FirebasePilotConfig): string {
  return config.mode === 'emulator'
    ? 'http://127.0.0.1:9099 http://127.0.0.1:8086'
    : 'https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com'
}
