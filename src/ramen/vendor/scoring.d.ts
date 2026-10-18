import type { RamenAnswer, RamenResult } from '../model'
import profile from '../profile.json'
declare const scoring: {
  RULES: {
    version: string
    minPhotos: number
    minRestaurants: number
    boundaryPP: number
    minRatingGroup: number
    answerScores: Record<'yes' | 'maybe' | 'no', number>
  }
  score(catalog: typeof profile, answers: { photo_id: string; value: RamenAnswer }[]): RamenResult
  toText(result: RamenResult, catalog: typeof profile): string
}
export default scoring
