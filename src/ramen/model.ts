export const RAMEN_DATASET = '2774febf7f831725e3da3564bfe1f5506d263e66ea2f94146903bb7609207c74'
export type RamenAnswer = 'yes' | 'maybe' | 'no' | 'skip'
export interface RamenState {
  dataset: string
  cursor: number
  answers: Record<string, RamenAnswer>
}
export const createRamenState = (): RamenState => ({
  dataset: RAMEN_DATASET,
  cursor: 0,
  answers: {},
})

export interface RatingGroup {
  rate: number | null
  n: number
  yes: number
  maybe: number
  no: number
  restaurants: number
}
export interface Comparison {
  id: string
  name: string
  labels: string[]
  phrases: string[]
  meaning?: string
  minus: RatingGroup
  plus: RatingGroup
  delta: number | null
  direction: number
  supported: boolean
  stable: boolean
  status: 'clear' | 'boundary' | 'insufficient'
  excluded: number
  leave_one_restaurant_out_range: number[] | null
}
export interface RamenResult {
  rules: { version: string }
  answered: number
  valid: number
  skipped: number
  yes: number
  maybe: number
  no: number
  enoughVariation: boolean
  axes: Comparison[]
  extras: Comparison[]
  flavors: (RatingGroup & { id: string; label: string; photo_ids: string[] })[]
  serving: (RatingGroup & { id: string; label: string })[]
  code: string | null
  closest_code: string | null
  candidate_codes: string[]
  paragraphs: string[]
  examples: Record<'yes' | 'maybe' | 'no', string[]>
}
