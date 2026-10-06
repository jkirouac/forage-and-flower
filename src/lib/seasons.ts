// Seasons data: the garden's plan items, plus the plants, sites and nurseries they
// point at. Edits go through the outbox (outbox.ts); the last good load is kept.

import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import { queue, readOps, type Op } from './outbox'
import { CACHES, findGardenId, readJson, useLiveTable, useLoadWhenBack, usePending, writeJson } from './local'
import { plantKey, type Nursery, type PlanItem, type Plant, type Site } from './plan'
import type { YardMap } from './yard'

export interface SeasonsData {
  gardenId: string | null
  items: PlanItem[]
  plants: Plant[]
  sites: Site[]
  nurseries: Nursery[]
  map: YardMap | null // the yard drawn on Plants, if the garden has one
  fromPhone?: boolean
}

// Unsent changes on this phone win over what the server has.
function applyEdits(data: SeasonsData, ops: Op[]): SeasonsData {
  let items = data.items
  let plants = data.plants
  for (const op of ops) {
    if (op.kind === 'plan-insert' && !items.some((i) => i.id === op.row.id)) items = [...items, op.row as unknown as PlanItem]
    else if (op.kind === 'plan-update') items = items.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i))
    else if (op.kind === 'plan-delete') items = items.filter((i) => i.id !== op.id)
    else if (op.kind === 'plant-insert' && !plants.some((p) => p.id === op.row.id)) plants = [...plants, op.row as unknown as Plant]
    else if (op.kind === 'plan-clear') items = items.map((i) => (op.ids.includes(i.id) ? { ...i, cleared_at: op.at } : i))
  }
  return { ...data, items, plants }
}

export async function loadSeasons(userId: string): Promise<SeasonsData> {
  try {
    const gardenId = await findGardenId(userId)
    if (!gardenId) return { gardenId: null, items: [], plants: [], sites: [], nurseries: [], map: null }
    const [items, plants, sites, nurseries, garden] = await Promise.all([
      supabase
        .from('plan_items')
        .select('id, garden_id, plant_id, site_id, season, status, qty_min, qty_max, nursery_id, spot, notes, cleared_at, status_by')
        .eq('garden_id', gardenId),
      supabase.from('plants').select('id, key, common, latin, kind').order('common'),
      supabase.from('sites').select('id, number, name, conditions, existing').eq('garden_id', gardenId).order('number'),
      supabase.from('nurseries').select('id, name, location, last_checked').order('name'),
      supabase.from('gardens').select('map').eq('id', gardenId).maybeSingle(),
    ])
    const error = items.error ?? plants.error ?? sites.error ?? nurseries.error ?? garden.error
    if (error) throw error
    const data: SeasonsData = {
      gardenId,
      items: items.data as PlanItem[],
      plants: plants.data as Plant[],
      sites: sites.data as Site[],
      nurseries: nurseries.data as Nursery[],
      map: (garden.data?.map as YardMap | null) ?? null,
    }
    writeJson(CACHES.seasons, { ...data, userId })
    return applyEdits(data, readOps())
  } catch (error) {
    const cached = readJson<(SeasonsData & { userId: string }) | null>(CACHES.seasons, null)
    // A cache from before the yard map has none.
    if (cached?.userId === userId) return { ...applyEdits({ ...cached, map: cached.map ?? null }, readOps()), fromPhone: true }
    throw error
  }
}

export type NewItem = Pick<PlanItem, 'plant_id' | 'season' | 'qty_min' | 'qty_max' | 'site_id' | 'nursery_id'>

export function useSeasons(userId: string) {
  const [data, setData] = useState<SeasonsData | null>(null)
  const [error, setError] = useState('')
  const pending = usePending()

  const reload = useCallback(() => {
    loadSeasons(userId)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch(() => setError("Couldn't load the lists. Check your connection and try again."))
  }, [userId])

  useLoadWhenBack(reload)
  const gardenId = data?.gardenId
  useLiveTable('plan_items', gardenId, reload)

  const change = useCallback((op: Op) => {
    setData((prev) => (prev ? applyEdits(prev, [op]) : prev))
    void queue(op)
  }, [])

  // A status change records who made it; going back to "to buy" un-clears the item.
  const update = useCallback(
    (id: string, patch: Partial<Omit<PlanItem, 'id' | 'garden_id'>>) => {
      const full = patch.status
        ? { ...patch, status_by: userId, ...(patch.status === 'to buy' ? { cleared_at: null } : {}) }
        : patch
      change({ kind: 'plan-update', id, patch: full })
    },
    [change, userId],
  )

  const clear = useCallback(
    (ids: string[]) => {
      if (ids.length) change({ kind: 'plan-clear', ids, at: new Date().toISOString() })
    },
    [change],
  )

  const remove = useCallback((id: string) => change({ kind: 'plan-delete', id }), [change])

  const add = useCallback(
    (item: NewItem) => {
      if (!gardenId) return
      const row = {
        id: crypto.randomUUID(),
        garden_id: gardenId,
        status: 'to buy',
        spot: null,
        notes: null,
        cleared_at: null,
        status_by: null,
        ...item,
      }
      change({ kind: 'plan-insert', row })
    },
    [change, gardenId],
  )

  // A plant that isn't in the catalogue yet. Returns its id for the new plan item.
  const addPlant = useCallback(
    (common: string, kind: string) => {
      const taken = new Set((data?.plants ?? []).map((p) => p.key))
      const row = { id: crypto.randomUUID(), key: plantKey(common, taken), common: common.trim(), latin: null, kind }
      change({ kind: 'plant-insert', row })
      return row.id
    },
    [change, data?.plants],
  )

  return { data, error, pending, reload, update, remove, add, addPlant, clear }
}
