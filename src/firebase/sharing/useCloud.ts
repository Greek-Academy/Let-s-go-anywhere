import { useEffect, useRef, useState } from 'react'
import { firebaseMessage, getFirebaseClient } from '../client'
import { sharingRepository } from './repository'
import type { CloudInvite, CloudItem, CloudList } from './model'

export function useCloud(uid: string) {
  const [repo] = useState(() => sharingRepository(getFirebaseClient().db, uid))
  const alive = useRef(false)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const valid = () =>
    alive.current && !document.hidden && getFirebaseClient().auth.currentUser?.uid === uid
  const run = async <T>(action: () => Promise<T>): Promise<{ value: T } | null> => {
    if (locked.current || !valid()) return null
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const value = await action()
      return valid() ? { value } : null
    } catch (e) {
      if (valid()) setError(firebaseMessage(e))
      return null
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  return { repo, busy, error, setError, run, valid }
}
export function useCloudList(uid: string, id: string) {
  const cloud = useCloud(uid)
  const [data, setData] = useState<{
    list: CloudList
    items: CloudItem[]
    invite: CloudInvite | null
  } | null>(null)
  const [readError, setReadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const latestMembers = useRef('')
  useEffect(() => {
    let alive = true,
      generation = 0
    setLoading(true)
    setReadError('')
    setData(null)
    const fail = (e: unknown) => {
      if (alive && cloud.valid()) {
        generation++
        setData(null)
        setLoading(false)
        setReadError(firebaseMessage(e))
      }
    }
    const timer = setTimeout(() => fail(new Error('read-timeout')), 12000)
    let unsubscribe = () => {}
    try {
      unsubscribe = cloud.repo.watch(
        id,
        (l) => {
          const task = ++generation
          // Membership changes invalidate previously displayed content immediately.
          const memberKey = l?.memberIds.join('|') ?? ''
          if (l?.status !== 'active' || latestMembers.current !== memberKey) setData(null)
          latestMembers.current = memberKey
          if (!l || !l.memberIds.includes(uid)) {
            fail(new Error('access-ended'))
            return
          }
          setLoading(true)
          void (async () => {
            const items = l.status === 'active' ? await cloud.repo.items(id) : []
            const invite =
              l.status === 'active' && l.ownerId === uid && l.currentInvite
                ? await cloud.repo.invitation(id, l.currentInvite)
                : null
            const latest = await cloud.repo.read(id)
            if (latest.revision !== l.revision) return
            if (alive && task === generation && cloud.valid()) {
              clearTimeout(timer)
              setData({ list: latest, items, invite })
              setLoading(false)
              setReadError('')
            }
          })().catch(fail)
        },
        fail,
      )
    } catch (e) {
      fail(e)
    }
    return () => {
      alive = false
      generation++
      clearTimeout(timer)
      unsubscribe()
    }
  }, [id, uid, tick, cloud.repo])
  return { ...cloud, data, loading, readError, refresh: () => setTick((t) => t + 1) }
}
