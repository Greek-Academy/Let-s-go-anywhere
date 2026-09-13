import type { TripFacts } from '../domain/tripConditions'
import { sampleFact, unknownFact } from './arrivalGuides'

// Closed, fictional examples for reviewing three-state matching; no routing or cost API.
export const tripFacts: Record<string, TripFacts> = {
  cafe: {
    context: sampleFact({ date: '2026-09-19', origin: '東京・渋谷駅周辺', departAt: '09:00' }),
    returnAt: sampleFact('16:00'),
    totalCost: sampleFact({
      min: 4000,
      max: 6000,
      complete: true,
      scope: '1人分の飲食・往復交通・駐車料金（車代は1人負担の設定）',
    }),
    scenes: {
      夜間: sampleFact(false),
      高速道路: sampleFact(false),
      狭い道: unknownFact(),
      山道: unknownFact(),
    },
  },
  fireworks: {
    context: sampleFact({ date: '2026-09-19', origin: '東京・渋谷駅周辺', departAt: '09:00' }),
    returnAt: sampleFact('22:00'),
    totalCost: sampleFact({
      min: 2000,
      max: 4000,
      complete: false,
      scope: '入場・飲食のみ。往復交通・駐車・車代は未取得',
    }),
    scenes: {
      夜間: sampleFact(true),
      高速道路: unknownFact(),
      狭い道: unknownFact(),
      山道: unknownFact(),
    },
  },
}
