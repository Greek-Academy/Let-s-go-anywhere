export const SHARING_KEY = 'driveplus.sharing.demo.v1'
export const actors = { self: 'あなた', haru: 'はる（デモ）' } as const
export type Actor = keyof typeof actors
export const colors = { teal: '青緑', blue: '空色', peach: '桃色' } as const
export type Color = keyof typeof colors
export const reactions = { want: '行きたい', interested: '気になる', pass: '今回は見送り' } as const
export type Reaction = keyof typeof reactions

/** Only these fields cross the personal -> shared boundary. No profile/learning/query state. */
export interface Candidate {
  kind: 'catalog' | 'web' | 'link'
  catalogId: string | null
  title: string
  area: string
  url: string | null
  status: string
  sample: boolean
  capturedAt: string
}
export interface SharedItem {
  id: string
  candidate: Candidate
  author: Actor | null
  note: string
  reactions: Partial<Record<Actor, Reaction>>
}
export interface Invitation {
  token: string
  expiresAt: number
  status: 'open' | 'revoked' | 'used'
  applicant: Actor | null
}
export interface SharedList {
  id: string
  name: string
  color: Color
  owner: Actor
  members: Actor[]
  items: SharedItem[]
  invites: Invitation[]
  successor: Actor | null
  updatedAt: string
}
export interface SharingState {
  schemaVersion: 1
  revision: number
  lists: SharedList[]
}
export const emptySharing = (): SharingState => ({ schemaVersion: 1, revision: 0, lists: [] })
export type Command =
  | { type: 'create'; name: string; color: Color }
  | { type: 'rename'; listId: string; name: string; color: Color }
  | { type: 'invite'; listId: string }
  | {
      type: 'revoke' | 'request' | 'withdraw' | 'approve' | 'reject'
      listId: string
      token: string
    }
  | { type: 'add'; listId: string; candidate: Candidate; note: string }
  | { type: 'edit'; listId: string; itemId: string; note: string }
  | { type: 'react'; listId: string; itemId: string; reaction: Reaction | null }
  | { type: 'removeItem'; listId: string; itemId: string }
  | { type: 'removeMember' | 'offerTransfer'; listId: string; member: Actor }
  | { type: 'acceptTransfer' | 'cancelTransfer' | 'leave' | 'delete'; listId: string }
export interface CommandResult {
  state: SharingState
  listId: string
  itemId?: string
  token?: string
  duplicate?: boolean
}
