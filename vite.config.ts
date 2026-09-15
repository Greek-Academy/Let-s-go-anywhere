import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { previewCsp, resolvePreviewConfig } from './build/preview.ts'

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
  const config = resolvePreviewConfig({
    ...loadEnv(mode, process.cwd(), 'DRIVEPLUS_'),
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.startsWith('DRIVEPLUS_')),
    ),
  })
  return {
    // No arbitrary VITE_* values are exposed to browser code. This preview needs no API keys.
    envPrefix: 'DRIVEPLUS_PUBLIC_',
    build: { sourcemap: false },
    plugins: [
      react(),
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
                    attrs: { 'http-equiv': 'Content-Security-Policy', content: previewCsp },
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
                  ...revision(),
                  builtAt: new Date().toISOString(),
                },
                null,
                2,
              ) + '\n',
          })
        },
      },
    ],
  }
})
