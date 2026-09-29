export interface PreviewConfig {
  channel: 'preview'
  contentSource: 'sample'
}

export const previewCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"

export function resolvePreviewConfig(env: Record<string, string | undefined>): PreviewConfig {
  const channel = env.DRIVEPLUS_RELEASE_CHANNEL ?? 'preview'
  const contentSource = env.DRIVEPLUS_CONTENT_SOURCE ?? 'sample'
  if (channel !== 'preview') {
    throw new Error(
      'Only preview releases are implemented. Production publishing is not configured.',
    )
  }
  if (contentSource !== 'sample') {
    throw new Error(
      'Only sample content is implemented. Refusing to fall back from another data source.',
    )
  }
  return { channel, contentSource }
}
