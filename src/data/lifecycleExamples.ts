import type { Outing } from './types'
import { sampleLifecycle } from './outingLifecycle'

// Direct-link fixtures for review. Their states exclude them from discovery.
const base: Outing = {
  id: 'sample-ended',
  title: '終了した湖畔イベント（確認用）',
  subtitle: '終了後も、保存した候補を確認できます。',
  image: '/images/fireworks.jpg',
  area: 'サンプルエリア',
  kind: 'event',
  tags: ['季節イベント'],
  date: '確認用サンプル',
  description: '状態の変化を確認するための架空のお出かけです。実際の開催情報ではありません。',
  source: '編集部',
  mood: '思い出の候補も、ここに',
  price: '未確認',
  lifecycle: sampleLifecycle(
    'past-example',
    '2026-09-05T10:00:00+09:00',
    '2026-09-05T17:00:00+09:00',
  ),
}
const cancelled = sampleLifecycle(
  'cancelled-example',
  '2026-09-19T10:00:00+09:00',
  '2026-09-19T17:00:00+09:00',
)
cancelled.notice = 'cancelled'
const stopped = sampleLifecycle(
  'stopped-example',
  '2026-09-19T10:00:00+09:00',
  '2026-09-19T17:00:00+09:00',
)
stopped.photo.state = 'withdrawn'
stopped.sources.forEach((source) => {
  source.available = false
})
const withdrawn = sampleLifecycle()
withdrawn.availability = 'withdrawn'
export const lifecycleExamples: Outing[] = [
  base,
  {
    ...base,
    id: 'sample-withdrawn',
    title: '掲載を停止したお出かけ（確認用）',
    description: 'この紹介文は掲載停止後に表示しない確認用の本文です。',
    lifecycle: withdrawn,
  },
  {
    ...base,
    id: 'sample-cancelled',
    title: '中止されたマーケット（確認用）',
    subtitle: '開催状態を確認して、次の楽しみを。',
    image: '/images/cafe.jpg',
    lifecycle: cancelled,
  },
  {
    ...base,
    id: 'sample-photo-stopped',
    title: '写真と情報を再確認中のお出かけ（確認用）',
    subtitle: '確認できない写真は表示しません。',
    image: '/images/coast.jpg',
    lifecycle: stopped,
  },
]
