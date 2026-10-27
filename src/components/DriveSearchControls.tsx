import { Check } from 'lucide-react'
import { interests } from '../data/options'
import {
  driveActivities,
  driveDurations,
  driveRoads,
  driveTimings,
  drivePaces,
  emptyDriveChoices,
} from '../domain/driveSearch'
import type { DriveChoices } from '../domain/driveSearch'
import { Chip } from './ui'

export function HobbyChoices({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <div className="hobby-grid" role="group" aria-label="趣味を選ぶ">
      {interests.map((h) => (
        <button
          key={h.name}
          type="button"
          aria-label={h.name}
          className={`hobby-choice ${value.includes(h.name) ? 'selected' : ''}`}
          aria-pressed={value.includes(h.name)}
          onClick={() =>
            onChange(
              value.includes(h.name) ? value.filter((v) => v !== h.name) : [...value, h.name],
            )
          }
        >
          <img src={h.image} alt="" />
          <span>
            <strong>{h.name}</strong>
            <small>{h.caption}</small>
          </span>
          {value.includes(h.name) && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}
export function DriveConditions({
  value,
  onChange,
}: {
  value: DriveChoices
  onChange: (value: DriveChoices) => void
}) {
  const patch = (part: Partial<DriveChoices>) => onChange({ ...value, ...part })
  return (
    <div className="drive-conditions">
      <p className="body-copy">
        まだ行き先が浮かばなくても大丈夫。気になる過ごし方から、今日のドライブを想像してみましょう。
      </p>
      <fieldset>
        <legend>
          どんなことを楽しみたい？ <small>6つまで</small>
        </legend>
        <div className="chips wrap">
          {driveActivities.map((a) => (
            <Chip
              key={a}
              selected={value.activities.includes(a)}
              disabled={!value.activities.includes(a) && value.activities.length >= 6}
              onClick={() =>
                patch({
                  activities: value.activities.includes(a)
                    ? value.activities.filter((v) => v !== a)
                    : [...value.activities, a],
                })
              }
            >
              {a}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>片道どのくらい走りたい？</legend>
        <div className="chips wrap">
          {driveDurations.map((duration) => (
            <Chip
              key={duration}
              selected={value.duration === duration}
              onClick={() => patch({ duration })}
            >
              {duration}
            </Chip>
          ))}
        </div>
        <p className="small muted">
          運転時間の目安です。往復・滞在・休憩には別に時間がかかります。
        </p>
      </fieldset>
      <fieldset>
        <legend>どんな道を走りたい？</legend>
        <div className="chips wrap">
          {driveRoads.map((road) => (
            <Chip key={road} selected={value.road === road} onClick={() => patch({ road })}>
              {road}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>いつの景色を楽しみたい？</legend>
        <div className="chips wrap">
          {driveTimings.map((timing) => (
            <Chip key={timing} selected={value.timing === timing} onClick={() => patch({ timing })}>
              {timing}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>どんなペースで過ごしたい？</legend>
        <div className="chips wrap">
          {drivePaces.map((pace) => (
            <Chip key={pace} selected={value.pace === pace} onClick={() => patch({ pace })}>
              {pace}
            </Chip>
          ))}
        </div>
      </fieldset>
      <button type="button" className="text-button" onClick={() => onChange(emptyDriveChoices())}>
        条件をリセット
      </button>
    </div>
  )
}
