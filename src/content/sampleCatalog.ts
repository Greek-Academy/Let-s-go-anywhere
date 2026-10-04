import { lifecycleExamples } from '../data/lifecycleExamples'
import { outings, stations, quizQuestions, learningContents } from '../data/mockData'
import { arrivalGuides } from '../data/arrivalGuides'
import { tripFacts } from '../data/tripFacts'
import { createContentCatalog } from './catalog'

// The only composition point for the current sample content.
export const sampleCatalog = createContentCatalog({
  source: 'sample',
  outings: [...outings, ...lifecycleExamples],
  stations,
  quizQuestions,
  learningContents,
  arrivalGuides,
  tripFacts,
})
