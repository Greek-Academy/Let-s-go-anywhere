import { today } from '../../src/domain/evidence.ts'
import { blankDraft } from './model.ts'
import type { Draft } from './model.ts'

// Fictional entries only. These are not findings or permission records for a real facility.
export function sampleDraft(at = today()): Draft {
  const result = blankDraft()
  const end = new Date(at + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 30)
  const reviewBy = end.toISOString().slice(0, 10)
  Object.assign(result, {
    id: 'sample-autumn',
    title: 'サンプル公園の秋まつり',
    summary: '秋の景色と、小さな寄り道。',
    area: '架空市・サンプル公園',
    description:
      '入力と表示の確認のために作った架空のイベントです。開催や施設確認の事実を示しません。',
    eventYear: Number(reviewBy.slice(0, 4)),
    startsAt: reviewBy + 'T10:00:00+09:00',
    endsAt: reviewBy + 'T16:00:00+09:00',
    tags: ['自然', '季節イベント'],
    sources: [
      {
        id: 'official-sample',
        kind: 'official',
        label: '架空の公式告知（サンプル）',
        url: 'https://example.com/sample-autumn',
        available: true,
      },
      {
        id: 'x-sample',
        kind: 'x',
        label: 'X由来の候補（架空URL）',
        url: 'https://x.com/driveplus_sample/status/1000000000000000000',
        available: false,
      },
      {
        id: 'tiktok-sample',
        kind: 'tiktok',
        label: 'TikTok由来の候補（架空URL）',
        url: 'https://www.tiktok.com/@driveplus_sample/video/1000000000000000000',
        available: false,
      },
    ],
    internalNote: 'すべて架空の入力例です。確認・承認・許諾が実施された記録ではありません。',
  })
  for (const field of ['title', 'location', 'schedule'] as const)
    result.checks[field] = {
      state: 'confirmed',
      sourceIds: ['official-sample'],
      checkedAt: at,
      reviewBy,
    }
  return result
}
