import questionsData from './questions.json'
import profile from './profile.json'
import scoring from './vendor/scoring.js'
import type { RamenState } from './model'

export { profile, scoring }
export const questions = questionsData.questions
export const photoUrl = (id: string) => `${import.meta.env.BASE_URL}images/ramen/${id}.jpg`
export const answerLabels = {
  yes: '好き',
  maybe: 'どちらともいえない',
  no: '好きではない',
  skip: '読込不可',
}
export const answerSymbols = { yes: '⭕️', maybe: '🔺', no: '❌', skip: '—' }
export const answersForScoring = (state: RamenState) =>
  questions.flatMap((q) => (state.answers[q.id] ? [{ ...q, value: state.answers[q.id] }] : []))
export const resultFor = (state: RamenState) => scoring.score(profile, answersForScoring(state))
