import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MAX_ATTEMPTS, PilotError } from './core.mjs'

export class Ledger {
  constructor(directory, maxAttempts = MAX_ATTEMPTS) {
    this.maxAttempts = maxAttempts
    this.directory = directory
    this.file = join(directory, 'usage.json')
  }
  read() {
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8'))
      if (
        value.version !== 1 ||
        !Array.isArray(value.attempts) ||
        value.attempts.length > this.maxAttempts ||
        !value.attempts.every(
          (a) => typeof a.id === 'string' && ['reserved', 'completed', 'failed'].includes(a.state),
        )
      )
        throw new Error()
      return value
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, attempts: [] }
      throw new PilotError(
        'ledger',
        '利用回数の記録を読めません。記録を削除せず、開発側へ確認してください。',
        503,
      )
    }
  }
  update(change) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const lock = join(this.directory, 'usage.lock')
    let fd
    try {
      fd = openSync(lock, 'wx', 0o600)
    } catch {
      throw new PilotError(
        'locked',
        '利用回数を記録中です。続く場合は開発側へ確認してください。',
        409,
      )
    }
    try {
      const data = this.read()
      const result = change(data)
      const temporary = join(this.directory, `usage-${randomUUID()}.tmp`)
      writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 })
      renameSync(temporary, this.file)
      return result
    } finally {
      closeSync(fd)
      unlinkSync(lock)
    }
  }
  reserve() {
    return this.update((data) => {
      if (data.attempts.length >= this.maxAttempts)
        throw new PilotError(
          'limit',
          `今回の実検索は${this.maxAttempts}回までです。結果を確認してから次の検証を決めます。`,
          429,
        )
      const id = randomUUID()
      data.attempts.push({ id, at: new Date().toISOString(), state: 'reserved', usage: null })
      return id
    })
  }
  finish(id, state, usage, elapsedMs) {
    this.update((data) => {
      const attempt = data.attempts.find((a) => a.id === id)
      if (!attempt) throw new PilotError('ledger', '利用記録との対応を確認できません。', 503)
      Object.assign(attempt, { state, usage, elapsedMs })
    })
  }
}
