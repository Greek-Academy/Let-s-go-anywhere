import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolvePublicSearch } from './build/publicSearch.ts'
import { privateDevelopmentFiles } from './build/privateFiles.ts'
import { searchBridge } from './build/searchBridge.ts'
import { previewCsp, resolvePreviewConfig } from './build/preview.ts'
import { firebaseConnectSources, resolveFirebasePilot } from './build/firebasePilot.ts'

function revision() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
    }
  } catch {
    return { commit: null, dirty: true }
  }
}

export default defineConfig(({ mode, command }) => {
  const environment = {
    ...loadEnv(mode, process.cwd(), 'DRIVEPLUS_'),
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.startsWith('DRIVEPLUS_')),
    ),
  }
  const firebase = resolveFirebasePilot(mode, environment)
  const publicSearch = resolvePublicSearch(mode, environment)
  const searchCsp = publicSearch
    ? previewCsp.replace('connect-src ', `connect-src ${publicSearch} `)
    : previewCsp
  const csp = firebase
    ? searchCsp.replace('connect-src ', `connect-src ${firebaseConnectSources(firebase)} `)
    : searchCsp
  const config = resolvePreviewConfig({
    ...environment,
  })
  return {
    // No arbitrary VITE_* values are exposed to browser code. This preview needs no API keys.
    envPrefix: 'DRIVEPLUS_PUBLIC_',
    define: {
      __FIREBASE_PILOT__: JSON.stringify(firebase),
      __PUBLIC_SEARCH_ORIGIN__: JSON.stringify(publicSearch),
    },
    build: {
      sourcemap: false,
      outDir: firebase
        ? firebase.mode === 'emulator'
          ? 'firebase-emulator-dist'
          : 'firebase-dist'
        : 'dist',
    },
    server: { fs: { deny: privateDevelopmentFiles } },
    plugins: [
      react(),
      searchBridge(Number(process.env.DRIVEPLUS_SEARCH_BACKEND_PORT ?? 4181)),
      {
        name: 'driveplus-preview-release',
        transformIndexHtml() {
          return [
            {
              tag: 'meta',
              attrs: { name: 'driveplus-channel', content: config.channel },
              injectTo: 'head',
            },
            {
              tag: 'meta',
              attrs: { name: 'driveplus-content', content: config.contentSource },
              injectTo: 'head',
            },
            ...(command === 'build'
              ? [
                  {
                    tag: 'meta',
                    attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
                    injectTo: 'head' as const,
                  },
                ]
              : []),
          ]
        },
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'release.json',
            source:
              JSON.stringify(
                {
                  schemaVersion: 1,
                  ...config,
                  ...(firebase ? { cloudPilot: firebase.mode } : {}),
                  ...(publicSearch ? { publicSearchOrigin: publicSearch } : {}),
                  ...revision(),
                  builtAt: new Date().toISOString(),
                },
                null,
                2,
              ) + '\n',
          })
        },
        async writeBundle(options) {
          if (!firebase) return
          const { readFile, writeFile } = await import('node:fs/promises')
          const path = `${options.dir}/_headers`
          const headers = await readFile(path, 'utf8')
          await writeFile(path, headers.replace(previewCsp, csp))
        },
      },
    ],
  }
})
