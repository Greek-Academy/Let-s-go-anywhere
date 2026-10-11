/** Bundled genre artwork, never a photograph of the suggested place. */
export const spotIllustrations = {
  cafe: { file: 'cafe.jpg', label: 'カフェ' },
  food: { file: 'food.jpg', label: '食事' },
  nature: { file: 'nature.jpg', label: '自然' },
  art: { file: 'art.jpg', label: 'アート' },
  event: { file: 'event.jpg', label: 'イベント' },
  outing: { file: 'outing.jpg', label: 'お出かけ' },
} as const

export type SpotIllustrationKind = keyof typeof spotIllustrations

const genres: Readonly<Record<string, SpotIllustrationKind>> = {
  カフェ: 'cafe',
  コーヒー: 'cafe',
  スイーツ: 'cafe',
  和食: 'food',
  洋食: 'food',
  自然: 'nature',
  景色: 'nature',
  アート: 'art',
}

export function spotIllustrationKind(spot: {
  tags?: readonly string[]
  event?: unknown
}): SpotIllustrationKind {
  if (spot.event) return 'event'
  // Use the original classification, never the person's private "liked for" choices.
  for (const tag of spot.tags ?? []) {
    if (Object.hasOwn(genres, tag)) return genres[tag]
  }
  return 'outing'
}
