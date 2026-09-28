const $ = (id) => document.getElementById(id)
let config
let report
let running = false
function text(tag, value, className) {
  const node = document.createElement(tag)
  node.textContent = value
  if (className) node.className = className
  return node
}
function showError(message) {
  $('error').textContent = message
  $('error').hidden = false
}
function updateButton() {
  $('search-button').disabled =
    running || !config?.configured || (!config.demo && config.attempts.length >= config.maxAttempts)
}
async function refreshStatus() {
  const response = await fetch('/api/status', { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  config = data
  $('mode').textContent = data.demo
    ? 'サンプル確認中 · 実際の検索は行いません。表示する施設は架空です。'
    : data.configured
      ? '実検索の検証 · 京都市の公式観光サイトから、確認前の候補を探します。'
      : 'キー未設定 · .env.research.local にOpenAI APIキーを保存し、サーバーを再起動してください。'
  $('search-button').textContent = data.demo
    ? 'サンプルのカードを確認する'
    : '候補を探す（APIを1回利用）'
  $('usage').replaceChildren(
    text(
      'p',
      data.demo
        ? 'サンプルのためAPI利用0回・追加費用0円です。'
        : `実検索 ${data.attempts.length} / ${data.maxAttempts} 回 · ${data.model}`,
    ),
  )
  if (!data.demo) {
    const known = data.attempts.filter((a) => a.usage !== null)
    const estimate = known.reduce((sum, a) => sum + a.usage.estimatedUsd, 0)
    $('usage').append(
      text(
        'p',
        `取得できた利用量の参考合計：$${estimate.toFixed(5)}（料金表 ${data.pricingDate}）`,
      ),
    )
    if (known.length !== data.attempts.length)
      $('usage').append(
        text(
          'p',
          `利用量・費用が未確定の試行：${data.attempts.length - known.length}件。0円とは扱いません。`,
        ),
      )
  }
  updateButton()
}

$('search-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (running || $('search-button').disabled) return
  running = true
  report = null
  $('error').hidden = true
  $('download').hidden = true
  $('results').replaceChildren()
  $('results').setAttribute('aria-busy', 'true')
  $('progress').textContent = '候補を調べています。最大2分ほどかかることがあります。'
  updateButton()
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pilot-Token': config.token },
      body: JSON.stringify({ region: $('region').value, theme: $('theme').value }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    report = data
    $('progress').textContent = data.spots.length
      ? `${data.spots.length}件の${data.mode === 'sample' ? '架空サンプル' : '確認前の候補'}が見つかりました。`
      : '条件に合い、出典を確認できる候補はありませんでした。条件を見直してから検索してください。'
    if (data.omitted)
      $('results').append(
        text('p', `根拠URL・形式・重複の確認で${data.omitted}件を除外しました。`, 'hint'),
      )
    for (const [index, spot] of data.spots.entries()) {
      const card = document.createElement('article')
      card.className = 'card'
      const visual = text(
        'div',
        ['01 / NATURE', '02 / A LITTLE BREAK', '03 / DISCOVER'][index],
        `visual visual-${index}`,
      )
      visual.append(text('span', '写真は未取得', 'photo-note'))
      const body = document.createElement('div')
      body.className = 'card-body'
      body.append(
        text('span', data.mode === 'sample' ? '架空サンプル' : 'AIが整理した候補・未確認', 'badge'),
      )
      body.append(
        text('h2', spot.name),
        text('p', spot.area, 'area'),
        text('p', spot.summary),
        text('p', spot.matchReason, 'reason'),
      )
      const source = text(
        'a',
        data.mode === 'sample'
          ? '出典リンクの例（施設の根拠ではありません） ↗'
          : 'この候補の情報元を確認する ↗',
        'source',
      )
      source.href = spot.sourceUrl
      source.target = '_blank'
      source.rel = 'noopener noreferrer'
      body.append(source, text('small', '営業時間・料金・駐車場：未確認'))
      card.append(visual, body)
      $('results').append(card)
    }
    $('results').append(text('p', data.sourcesNote, 'hint'))
    if (data.mode === 'live')
      $('results').append(
        text(
          'p',
          `検索日時：${new Date(data.retrievedAt).toLocaleString('ja-JP')} · ${(data.elapsedMs / 1000).toFixed(1)}秒`,
          'hint',
        ),
      )
    $('download').hidden = false
  } catch (error) {
    $('progress').textContent = ''
    showError(error.message || '通信に失敗しました。')
  } finally {
    running = false
    $('results').setAttribute('aria-busy', 'false')
    try {
      await refreshStatus()
    } catch {
      config = null
      showError('利用状態を確認できません。再検索せず、サーバーの状態を確認してください。')
    }
    updateButton()
  }
})
$('download').addEventListener('click', () => {
  if (!report) return
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `driveplus-research-${report.mode}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})
refreshStatus()
  .then(() => {
    $('theme').value = config.theme
  })
  .catch(() => showError('検証サーバーに接続できません。起動を確認して画面を開き直してください。'))
