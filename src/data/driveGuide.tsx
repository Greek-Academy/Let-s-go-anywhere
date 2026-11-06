import type { ReactNode } from 'react'
import { CarFront, Coffee, Leaf, MapPin, Moon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type GuidePage = {
  label: string
  kicker: string
  title: ReactNode
  speech: ReactNode
  alt: string
  caption: ReactNode
  chips?: { icon?: LucideIcon; label: string }[]
  query?: string
  note?: string
}

export const driveGuidePages: GuidePage[] = [
  {
    label: '行き先は、まだなくていい',
    kicker: 'ある休日のこと',
    title: (
      <>
        目的地はない。
        <br />
        でも、<em>走りたい。</em>
      </>
    ),
    speech: (
      <>
        どこか遠くに行きたいな。
        <br />
        でも、どこへ…？
      </>
    ),
    alt: '窓の外の車を眺めながら、行き先を考える人',
    caption: (
      <>
        何がしたいか、はっきりしない日も。
        <br />
        <strong>「ドライブしたい」だけで、はじめよう。</strong>
      </>
    ),
    chips: [{ icon: CarFront, label: 'そんなとき、Drive+を開く' }],
  },
  {
    label: 'まずは「好き」を選ぶ',
    kicker: '好きなことが、きっかけに',
    title: (
      <>
        まずは、あなたの
        <br />
        <em>「好き」を教えて。</em>
      </>
    ),
    speech: (
      <>
        自然も、カフェも、
        <br />
        温泉も好き！
      </>
    ),
    alt: 'スマートフォンで趣味を選び、山やコーヒー、温泉を思い浮かべる人',
    caption: (
      <>
        自然、グルメ、温泉…。
        <br />
        <strong>趣味は、いくつ選んでも大丈夫。</strong>
      </>
    ),
    chips: [{ icon: Leaf, label: '自然' }, { icon: Coffee, label: 'グルメ' }, { label: '♨ 温泉' }],
  },
  {
    label: 'AIが、ドライブ先を見つける',
    kicker: '行き先のアイデアが届く',
    title: (
      <>
        <em>1〜5時間先</em>に、
        <br />
        こんな場所があったんだ。
      </>
    ),
    speech: <>この景色、見てみたいかも。</>,
    alt: 'スマートフォンから緑の渓谷、カフェ、温泉などの行き先が広がる',
    caption: (
      <>
        現在地や選んだ駅を起点に、AIが趣味に合うスポットを提案。
        <strong>パネルを眺めて、気になる場所を見つけよう。</strong>
      </>
    ),
    chips: [{ icon: MapPin, label: '出発地から片道1〜5時間が目安' }],
  },
  {
    label: 'その日の「気分」に気づく',
    kicker: 'まだ、ピンとこなくても',
    title: (
      <>
        言われてみれば、
        <br />
        <em>今日はそんな気分。</em>
      </>
    ),
    speech: (
      <>
        そうだ、夜景を見ながら
        <br />
        のんびりしたい！
      </>
    ),
    alt: '夜景やおいしい食事を思い浮かべ、自分の気分に気づいた人',
    caption: (
      <>
        「夜景が見たい」「おいしいものを食べたい」。項目を見て、
        <strong>今の気分から探してもOK。</strong>
      </>
    ),
    chips: [
      { icon: Moon, label: '夜景を見たい' },
      { icon: Coffee, label: 'おいしいもの' },
    ],
    note: '最初に選んだ趣味とは別に、その日の気分で探せます。',
  },
  {
    label: '思いついた言葉でも探せる',
    kicker: 'アイデアが浮かんだら',
    title: (
      <>
        ふと浮かんだひと言を、
        <br />
        <em>そのまま検索。</em>
      </>
    ),
    speech: (
      <>
        海の見えるカフェ、
        <br />
        なんてどうだろう？
      </>
    ),
    alt: '海辺のカフェを思い描きながら、スマートフォンに希望を入力する手',
    caption: (
      <>
        パネルを見て、やりたいことが浮かんだら。
        <strong>自由な言葉をもとに、AIが行き先を探します。</strong>
      </>
    ),
    query: '海を眺めながら、コーヒーを飲みたい',
    note: '気分から選んでも、言葉で伝えても。探し方は自由です。',
  },
  {
    label: '「ここへ行こう」が見つかる',
    kicker: 'さあ、次の休日へ',
    title: (
      <>
        「どこかへ」が、
        <br />
        <em>「ここへ行こう」に。</em>
      </>
    ),
    speech: (
      <>
        よし、今日はここまで
        <br />
        走ってみよう！
      </>
    ),
    alt: '夕方の海沿いの道を、山に向かって走る車',
    caption: (
      <>
        行き先が決まったら、地図アプリや公式サイトでルート・営業時間を確認。
        <strong>あとは、自分のペースで出かけよう。</strong>
      </>
    ),
    chips: [{ icon: CarFront, label: '走りたい気持ちを、次の一歩に。' }],
  },
]
