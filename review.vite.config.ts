import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate local tool: not an input to the app's dist/ build.
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('./tools/content-review', import.meta.url)),
  publicDir: '../../public',
  envPrefix: 'CONTENT_REVIEW_PUBLIC_',
  build: {
    outDir: '../../review-dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      input: {
        review: fileURLToPath(new URL('./tools/content-review/index.html', import.meta.url)),
        app: fileURLToPath(new URL('./tools/content-review/app.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4180,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
  preview: {
    host: '127.0.0.1',
    port: 4180,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  },
  plugins: [
    react(),
    {
      name: 'local-review-policy',
      transformIndexHtml() {
        return command === 'build'
          ? [
              {
                tag: 'meta',
                attrs: {
                  'http-equiv': 'Content-Security-Policy',
                  content:
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
                },
                injectTo: 'head' as const,
              },
            ]
          : []
      },
    },
  ],
}))
