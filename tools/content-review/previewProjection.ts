import type { Outing } from '../../src/data/types'
import type { LifecycleCheck } from '../../src/domain/outingLifecycle'
import { today } from '../../src/domain/evidence'
import { canPreviewPhoto, parseDraft, validateDraft } from './model'
import type { Draft, Field } from './model'

export interface AppPreviewSnapshot {
  outing: Outing
}
export interface AppPreviewWindow extends Window {
  driveplusReviewPreview?: { present: (snapshot: AppPreviewSnapshot) => void }
}

/** Local display projection only. Never spread a draft or transfer its private records. */
export function createAppPreview(
  input: Draft,
  photo: { name: string; url: string } | null = null,
  at = today(),
): AppPreviewSnapshot {
  const draft = parseDraft(input)
  const problems = validateDraft(draft, at)
  if (problems.some((p) => p.path === 'id' || p.path === 'title' || p.path === 'at'))
    throw new Error('アプリで確認するには、管理IDと名称を入力してください。')

  // Keep only opaque source references: labels, URLs and permission notes stay in the editor.
  const sourceId = (id: string) => 'reference-' + draft.sources.findIndex((s) => s.id === id)
  const textProblem = problems.some(
    (p) => !p.path.startsWith('photo.') && !p.path.startsWith('checks.'),
  )
  const check = (field: Field): LifecycleCheck => ({
    state: textProblem ? 'unconfirmed' : draft.checks[field].state,
    sourceIds: draft.checks[field].sourceIds.map(sourceId),
    checkedAt: draft.checks[field].checkedAt || null,
    reviewBy: draft.checks[field].reviewBy || null,
  })
  const photoVisible =
    photo?.name === draft.photo.assetName &&
    photo.url.startsWith('blob:') &&
    canPreviewPhoto(draft, at)
  const id = 'review-' + draft.id
  return {
    outing: {
      id,
      title: draft.title,
      subtitle: draft.summary,
      area: draft.area,
      kind: draft.kind,
      description: draft.description,
      tags: [...new Set(draft.tags.filter((tag) => tag.trim()))],
      image: photoVisible ? photo.url : '',
      ...(photoVisible ? { imageAlt: draft.photo.alt, imageCredit: draft.photo.credit } : {}),
      date: '',
      source: '入力ツール',
      mood: '入力した候補の表示確認',
      price: '未確認',
      lifecycle: {
        availability: 'listed',
        notice: 'normal',
        sources: [
          ...draft.sources.map((s, i) => ({
            id: 'reference-' + i,
            kind: s.kind === 'x' || s.kind === 'tiktok' ? ('sns' as const) : s.kind,
            available: s.available,
          })),
          { id: 'photo-reference', kind: 'onsite', available: !!photoVisible },
        ],
        checks: { title: check('title'), location: check('location'), schedule: check('schedule') },
        occurrence:
          draft.kind === 'event'
            ? {
                seriesId: id,
                venueId: id + '-venue',
                eventYear: draft.eventYear ?? 0,
                startsAt: draft.startsAt,
                endsAt: draft.endsAt,
              }
            : null,
        photo: {
          state: photoVisible ? 'confirmed' : 'unconfirmed',
          sourceIds: photoVisible ? ['photo-reference'] : [],
          checkedAt: photoVisible ? draft.photo.checkedAt : null,
          reviewBy: photoVisible ? draft.photo.reviewBy : null,
        },
      },
    },
  }
}
