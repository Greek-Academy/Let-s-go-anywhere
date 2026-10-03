import { stateStore } from '../platform/stateStore'
import { applyCommand, requireValue } from './domain'
import { checkCandidateFields, decodeSharing } from './codec'
import { emptySharing, SHARING_KEY } from './model'
import type { Actor, Command, CommandResult, SharingState } from './model'

export interface SharingSnapshot {
  state: SharingState
  version: string | null
}
export interface SharedListsRepository {
  read(): Promise<SharingSnapshot>
  execute(
    actor: Actor,
    command: Command,
    expectedVersion: string | null,
  ): Promise<CommandResult & { version: string }>
  clear(): Promise<void>
}
type Store = Pick<typeof stateStore, 'getItem' | 'setItem' | 'removeItem'>
export function createMemoryStore(): Store {
  let value: string | null = null
  return {
    getItem: async () => value,
    setItem: async (_key, next) => {
      value = next
    },
    removeItem: async () => {
      value = null
    },
  }
}
/** Device-only demo. This adapter is NOT authentication or a server-side authorization boundary. */
export function createDemoRepository(store: Store = stateStore): SharedListsRepository {
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const locked = async (): Promise<T> =>
      typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request(SHARING_KEY, work)
        : await work()
    const next = queue.then(locked, locked)
    queue = next.catch(() => undefined)
    return next
  }
  return {
    read: () =>
      serial(async () => {
        const raw = await store.getItem(SHARING_KEY)
        return { state: raw === null ? emptySharing() : decodeSharing(raw), version: raw }
      }),
    execute: (actor, command, expectedVersion) =>
      serial(async () => {
        const raw = await store.getItem(SHARING_KEY)
        requireValue(
          raw === expectedVersion,
          '別の画面で変更されました。「最新の内容を読み直す」で確認してください。編集中なら内容を控えて閉じ、開き直してから保存してください。',
        )
        if (command.type === 'add') checkCandidateFields(command.candidate)
        const result = applyCommand(
          raw === null ? emptySharing() : decodeSharing(raw),
          actor,
          command,
        )
        const version = JSON.stringify(result.state)
        decodeSharing(version)
        await store.setItem(SHARING_KEY, version)
        return { ...result, version }
      }),
    clear: () => serial(() => store.removeItem(SHARING_KEY)),
  }
}
