import type { UserProfile } from './types'

// UI choices and guest defaults are independent of the published content source.
export const interests = [
  { name: '自然', image: '/images/fuji.jpg', caption: '心ほどける景色' },
  { name: 'グルメ', image: '/images/cafe.jpg', caption: 'おいしい寄り道' },
  { name: '温泉', image: '/images/coast.jpg', caption: 'ゆっくり、ひと休み' },
  { name: 'アウトドア', image: '/images/forest.jpg', caption: '自然を全身で' },
  { name: '季節イベント', image: '/images/fireworks.jpg', caption: '今だけの楽しみ' },
  { name: '買い物', image: '/images/cafe.jpg', caption: 'お気に入り探し' },
]

export const companions = [
  { name: '恋人・パートナー', emoji: '🤍', text: 'ふたりの思い出を増やしたい' },
  { name: '友人', emoji: '🌿', text: '気の合う仲間と、ちょっと遠くへ' },
  { name: '家族', emoji: '🏡', text: 'みんなで過ごす時間を楽しみたい' },
  { name: '一人', emoji: '☕', text: '自分のペースで、気ままに' },
  { name: '未定', emoji: '✨', text: 'まずは行きたい場所を探したい' },
]

export const userProfile: UserProfile = {
  name: 'ゲスト',
  area: '東京・渋谷駅周辺',
  companion: '',
  interests: [],
}

export const scenarios = ['駐車', '車線変更', '高速道路', '夜間', '一般道']

export const experiences = [
  '免許取得後、ほとんど運転していない',
  '以前は運転していたが、今はしていない',
  'ときどき運転している',
  'まだ整理できていない',
]

export const sharingLabels = {
  goal: '目標・行きたいこと',
  when: '希望日時',
  vehicle: '希望する車両',
  questions: '講師への質問',
  experience: '運転経験（自己申告）',
  concerns: '不安な場面（自己申告）',
  knowledge: '知識チェックの回答状況',
}
