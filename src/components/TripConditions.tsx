import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { FormEvent } from 'react'
import { useApp } from '../state/AppState'
import { tripFacts } from '../data/tripFacts'
import {
  conditionsError,
  drivingScenes,
  emptyConditions,
  evaluateConditions,
  evidenceCaption,
  hasConditions,
  matchLabels,
  overallMatch,
} from '../domain/tripConditions'
import type { TripConditions, ConditionResult } from '../domain/tripConditions'
import { BottomSheet, Chip, PrimaryButton, Tag } from './ui'

export function ConditionsSheet({
  value,
  onSave,
  onClose,
  title = '今回のお出かけ条件',
}: {
  value: TripConditions
  onSave: (value: TripConditions) => void
  onClose: () => void
  title?: string
}) {
  const [draft, setDraft] = useState<TripConditions>(() => ({ ...value, avoid: [...value.avoid] }))
  const [error, setError] = useState('')
  const patch = (p: Partial<TripConditions>) => {
    setDraft((d) => ({ ...d, ...p }))
    setError('')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const message = conditionsError(draft)
    if (message) {
      setError(message)
      return
    }
    onSave(draft)
    onClose()
  }
  return (
    <BottomSheet title={title} onClose={onClose}>
      <p className="body-copy">
        日帰りのお出かけを、自分のペースで。趣味や知識チェックの回答とは別に保存します。
      </p>
      <form onSubmit={submit}>
        <label className="field-label">
          お出かけ日
          <input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>
        <div className="condition-time-row">
          <label className="field-label">
            出発時刻
            <input
              type="time"
              value={draft.departAt}
              onChange={(e) => patch({ departAt: e.target.value })}
            />
          </label>
          <label className="field-label">
            帰宅希望時刻
            <input
              type="time"
              value={draft.returnBy}
              onChange={(e) => patch({ returnBy: e.target.value })}
            />
          </label>
        </div>
        <label className="field-label">
          1人あたりの予算（円）
          <input
            type="number"
            min="0"
            max="10000000"
            step="1"
            inputMode="numeric"
            value={draft.budget}
            onChange={(e) => patch({ budget: e.target.value })}
            placeholder="例：8000"
          />
        </label>
        <p className="muted small">
          飲食・入場・往復交通・駐車・車代を含む予算。人数や負担額が不明なら、条件の適合は未確認です。
        </p>
        <fieldset className="condition-scenes">
          <legend>今回避けたい運転場面</legend>
          <div className="chips wrap">
            {drivingScenes.map((scene) => (
              <Chip
                key={scene}
                selected={draft.avoid.includes(scene)}
                onClick={() =>
                  patch({
                    avoid: draft.avoid.includes(scene)
                      ? draft.avoid.filter((v) => v !== scene)
                      : [...draft.avoid, scene],
                  })
                }
              >
                {scene}
              </Chip>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <PrimaryButton type="submit">条件を保存</PrimaryButton>
        <PrimaryButton
          variant="ghost"
          onClick={() => {
            onSave(emptyConditions())
            onClose()
          }}
        >
          この条件を解除
        </PrimaryButton>
      </form>
    </BottomSheet>
  )
}

export function ConditionReasons({ results }: { results: ConditionResult[] }) {
  if (!results.length) return null
  return (
    <ul className="condition-results">
      {results.map((r) => (
        <li key={r.label}>
          <div>
            <strong>{r.label}</strong>
            <Tag tone={r.state === 'match' ? 'mint' : r.state === 'mismatch' ? 'peach' : 'neutral'}>
              {matchLabels[r.state]}
            </Tag>
          </div>
          <p>{r.reason}</p>
          <small>{evidenceCaption(r.evidence)}</small>
        </li>
      ))}
    </ul>
  )
}

export function OutingConditions({ outingId }: { outingId: string }) {
  const { state, update } = useApp()
  const [open, setOpen] = useState(false)
  const value = state.outingConditions[outingId] ?? emptyConditions()
  const results = evaluateConditions(value, tripFacts[outingId], state.profile.area)
  return (
    <section className="outing-conditions">
      <button className="condition-edit-button" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={20} />
        <span>
          <strong>このお出かけの条件</strong>
          <small>
            {hasConditions(value)
              ? matchLabels[overallMatch(results)]
              : '時間・予算・避けたい場面をメモ'}
          </small>
        </span>
      </button>
      <ConditionReasons results={results} />
      {open && (
        <ConditionsSheet
          title="このお出かけの条件"
          value={value}
          onClose={() => setOpen(false)}
          onSave={(v) =>
            update((s) => ({ ...s, outingConditions: { ...s.outingConditions, [outingId]: v } }))
          }
        />
      )}
    </section>
  )
}
