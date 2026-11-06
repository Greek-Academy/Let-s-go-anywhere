import { interests } from '../data/options.ts'
import type { DriveQuery } from './driveSearch.ts'

const hobbyNames = interests.map((interest) => interest.name)

export function searchHobbies(drive?: DriveQuery): string[] {
  return drive && (drive.mode === 'default' || drive.mode === 'events') ? drive.hobbies : []
}

export function hobbyTargets(hobbies: string[], total = 10) {
  return hobbies.map((hobby, index) => ({
    hobby,
    count: Math.floor(total / hobbies.length) + (index < total % hobbies.length ? 1 : 0),
  }))
}

/** AI classifications must refer to selected hobbies, never arbitrary model text. */
export function decodeHobbyMatches(value: unknown, allowed = hobbyNames): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > allowed.length ||
    new Set(value).size !== value.length ||
    value.some((hobby) => typeof hobby !== 'string' || !allowed.includes(hobby))
  )
    throw new Error('候補と趣味の対応を確認できません。')
  return [...value]
}

interface HobbyCandidate {
  matchedHobbies?: string[]
}

/**
 * Allocate one place per slot, after source, duplicate and route checks.
 * Round-robin slots keep available hobbies balanced. Augmenting paths let a
 * multi-hobby place move to another slot instead of crowding out a rare hobby.
 * Unfilled slots spill to other selected hobbies; no extra search or invented match.
 */
export function balanceHobbyCandidates<T extends HobbyCandidate>(
  candidates: T[],
  hobbies: string[],
  total = 10,
): (T & { hobby?: string })[] {
  if (!hobbies.length) return candidates.slice(0, total)
  const slots: { hobby: string; candidate: number }[] = []
  const owners = new Map<number, number>()
  const assign = (slot: number, seen: Set<number>): boolean => {
    const matches = candidates.flatMap((candidate, index) =>
      candidate.matchedHobbies?.includes(slots[slot].hobby) && !seen.has(index) ? [index] : [],
    )
    // Preserve provider order unless reassignment is needed to fill a hobby's slot.
    for (const index of [
      ...matches.filter((i) => !owners.has(i)),
      ...matches.filter((i) => owners.has(i)),
    ]) {
      if (seen.has(index)) continue
      seen.add(index)
      const previous = owners.get(index)
      if (previous === undefined || assign(previous, seen)) {
        slots[slot].candidate = index
        owners.set(index, slot)
        return true
      }
    }
    return false
  }
  while (slots.length < total) {
    const before = slots.length
    for (const hobby of hobbies) {
      if (slots.length === total) break
      slots.push({ hobby, candidate: -1 })
      if (!assign(slots.length - 1, new Set())) slots.pop()
    }
    if (slots.length === before) break
  }
  return slots.map(({ hobby, candidate }) => ({ ...candidates[candidate], hobby }))
}
