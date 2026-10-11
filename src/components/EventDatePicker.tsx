import { CalendarDays } from 'lucide-react'
import { Chip } from './ui'
import { addDays, eventDates, eventDatesLabel } from '../domain/eventSearch'
import type { EventSelection } from '../domain/eventSearch'
import { japanDate } from '../domain/dates'

export function EventDatePicker({
  value,
  onChange,
  now,
}: {
  value: EventSelection
  onChange: (v: EventSelection) => void
  now: Date
}) {
  const dates = eventDates(value, now)
  const today = japanDate(now)
  return (
    <div className="event-date-picker">
      <h2>
        <CalendarDays size={18} /> いつのイベントを探す？
      </h2>
      <div className="chips" aria-label="イベントを探す日付">
        {(
          [
            ['today', '今日'],
            ['weekend', '今週末'],
            ['custom', '日付を選ぶ'],
          ] as const
        ).map(([mode, label]) => (
          <Chip
            key={mode}
            selected={value.mode === mode}
            onClick={() => onChange({ ...value, mode })}
          >
            {label}
          </Chip>
        ))}
      </div>
      {value.mode === 'custom' && (
        <label className="field-label">
          イベントの日付
          <input
            type="date"
            min={today}
            max={addDays(today, 365)}
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </label>
      )}
      <p className="small muted">
        {dates ? `${eventDatesLabel(dates)}（日本時間）` : '日付を選んでください。'}
      </p>
      <p className="small muted">
        地域と日付から探します。「おすすめ」のジャンルや追加の希望は使いません。
      </p>
    </div>
  )
}
