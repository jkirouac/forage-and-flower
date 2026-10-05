// What the phone keeps between visits: the last good load of each screen, so the
// app opens in the garden with no signal, plus the outbox (outbox.ts).

import { useEffect, useState } from 'react'
import { clearOutbox, flush, pendingCount } from './outbox'
import { supabase } from './supabase'

export const CACHES = { garden: 'ff-garden', seasons: 'ff-seasons' } as const

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the app still works online.
  }
}

// On sign-out, so the next person on this phone sees nothing of this garden.
export function clearLocal() {
  clearOutbox()
  for (const key of Object.values(CACHES)) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}

// The garden this account belongs to, or null.
export async function findGardenId(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('members').select('garden_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return (data?.garden_id as string | undefined) ?? null
}

// How many changes are waiting to be sent.
export function usePending() {
  const [pending, setPending] = useState(pendingCount)
  useEffect(() => {
    const update = () => setPending(pendingCount())
    window.addEventListener('ff-outbox', update)
    return () => window.removeEventListener('ff-outbox', update)
  }, [])
  return pending
}

// Load now, and again when the app comes back to the front or the phone gets signal,
// sending anything waiting first.
export function useLoadWhenBack(reload: () => void) {
  useEffect(() => {
    reload()
    const again = () => void flush().then(reload)
    const onVisible = () => {
      if (document.visibilityState === 'visible') again()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', again)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', again)
    }
  }, [reload])
}

// Reload when the other phone changes a table in this garden.
export function useLiveTable(table: string, gardenId: string | null | undefined, reload: () => void) {
  useEffect(() => {
    if (!gardenId) return
    const channel = supabase
      .channel(`${table}-${gardenId}`)
      .on('postgres_changes', { event: '*', schema: 'garden', table, filter: `garden_id=eq.${gardenId}` }, () => reload())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, gardenId, reload])
}
