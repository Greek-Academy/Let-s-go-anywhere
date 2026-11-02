/** Google's returned Search Suggestions, isolated from the app's DOM and styles. */
export function GoogleSearchAttribution({ html }: { html: string }) {
  return (
    <iframe
      title="Google検索の関連候補"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com; base-uri 'none'; form-action 'none'"><base target="_blank"></head><body style="margin:0">${html}</body></html>`}
      // Match the app's light surface; Google's unmodified CSS chooses its light variant.
      style={{ width: '100%', height: 80, border: 0, marginTop: 16, colorScheme: 'light' }}
    />
  )
}
