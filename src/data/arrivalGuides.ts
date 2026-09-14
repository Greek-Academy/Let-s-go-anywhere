import type { Evidence } from '../domain/evidence'

export interface Entrance {
  description: string
  mapLabel: string
}
export interface ArrivalPhoto {
  src: string
  alt: string
  permission: Evidence<string>
}
export interface ArrivalGuide {
  outingId: string
  availability: 'published' | 'withdrawn'
  vehicleEntrance: Evidence<Entrance>
  pedestrianEntrance: Evidence<string>
  facts: { label: string; fact: Evidence<string> }[]
  steps: { title: string; fact: Evidence<string>; photo?: ArrivalPhoto }[]
  alternatives: Evidence<string[]>
  photo?: ArrivalPhoto
}

// Fictional editorial fixtures. These are NOT real facility confirmations or photographs.
export function sampleFact<T>(value: T): Evidence<T> {
  return {
    value,
    status: 'confirmed',
    source: '施設への確認記録（架空のサンプル）',
    checkedAt: '2026-09-14',
    reviewBy: '2026-12-31',
  }
}
export function unknownFact<T>(): Evidence<T> {
  return { value: null, status: 'unconfirmed', source: '', checkedAt: null, reviewBy: null }
}

export const arrivalGuides: Record<string, ArrivalGuide> = {
  fuji: {
    outingId: 'fuji',
    availability: 'published',
    vehicleEntrance: sampleFact({
      description: '湖側の道路に面した「第1駐車場」の車入口。歩行者用の正面入口とは別です。',
      mapLabel: '第1駐車場・車入口（架空）',
    }),
    pedestrianEntrance: sampleFact('建物の正面にある歩行者入口。車の進入先ではありません。'),
    facts: [
      { label: '駐車場の形式', fact: sampleFact('平面・ゲート式') },
      { label: '車両サイズ', fact: sampleFact('全長5m・全幅1.9m・全高2.1mまで（例）') },
      { label: '営業時間・入出庫', fact: sampleFact('9:00〜18:00。時間外の入出庫不可（例）') },
      {
        label: '予約の要否',
        fact: sampleFact('事前予約なし（例）。駐車できることの保証ではありません。'),
      },
      { label: '支払い方法', fact: unknownFact() },
    ],
    steps: [
      {
        title: '車入口を確認',
        fact: sampleFact(
          '出発前に、車入口の位置と案内表示を確認します。入口の概念図と実際の現地案内は異なります。',
        ),
      },
      {
        title: 'ゲート・駐車券',
        fact: sampleFact(
          '入口ゲートで駐車券を受け取る形式です（例）。現地の表示に従ってください。',
        ),
      },
      {
        title: '出庫前に精算',
        fact: sampleFact('建物側の事前精算機を使う形式です（例）。使える支払い方法は未確認です。'),
      },
      {
        title: '出口へ',
        fact: sampleFact(
          '出口ゲートに駐車券を入れる形式です（例）。出口の現地案内を確認してください。',
        ),
      },
    ],
    alternatives: sampleFact([
      '第2駐車場（架空）：所在地・利用条件は再確認が必要です。空き状況は取得していません。',
    ]),
  },
  forest: {
    outingId: 'forest',
    availability: 'published',
    vehicleEntrance: {
      ...sampleFact({ description: '旧入口の位置', mapLabel: '旧車入口' }),
      reviewBy: '2026-09-13',
      checkedAt: '2026-09-01',
    },
    pedestrianEntrance: unknownFact(),
    facts: [
      { label: '駐車場の形式', fact: unknownFact() },
      { label: '利用条件', fact: unknownFact() },
    ],
    steps: [{ title: '入庫から退出まで', fact: unknownFact() }],
    alternatives: unknownFact(),
  },
}
