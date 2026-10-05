// Preserve Vite 8's default deny list and also keep local search queries/results private.
// Apply to both development entry points; .gitignore alone does not stop HTTP serving.
export const privateDevelopmentFiles = [
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
  '**/.local-research/**',
]
