export const discoveryTags = ['自然', 'グルメ', '温泉', 'アウトドア', '季節イベント', '買い物']

/** One canonical condition for the request, result label, and stale-result comparison. */
export function searchTheme(text: string, tag: string): string {
  const extra = text.trim()
  return tag && extra && tag !== extra ? `${tag} / ${extra}` : tag || extra
}

export function searchThemeError(text: string, tag: string): string | null {
  if (tag && !discoveryTags.includes(tag)) return 'ジャンルを選び直してください。'
  const theme = searchTheme(text, tag)
  if (!theme) return 'ジャンルを選ぶか、気になる場所や、したいことを入力してください。'
  if (theme.length > 80 || /[\u0000-\u001f\u007f]/u.test(theme))
    return 'ジャンルと追加の希望を合わせて80文字以内で入力してください。'
  return null
}
