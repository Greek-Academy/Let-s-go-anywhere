import type { WebSpot } from '../domain/webSearch'
import { japanDate } from '../domain/dates'
import { useContentTime } from '../content/ContentProvider'

export function WebEventSchedule({ spot }: { spot: WebSpot }) {
  const now = useContentTime()
  const event = spot.event
  if (!event) return null
  const past = event.endDate < japanDate(now)
  return (
    <div className="web-event-schedule">
      <strong>
        {past ? '掲載されていた開催期間は終了しています' : '開催予定（AI整理・未確認）'}
      </strong>
      <p>
        期間：{event.startDate}
        {event.startDate !== event.endDate && ` 〜 ${event.endDate}`}
      </p>
      <p>検索日に開催予定：{event.occursOn.join('・')}</p>
      <p>時間：{event.timeText}</p>
      <p>会場：{event.venue}</p>
      <p className="small muted">変更・中止・予約条件は出典で確認してください。</p>
    </div>
  )
}
