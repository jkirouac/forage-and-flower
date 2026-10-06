// Plant pages' data: the whole catalogue (with months, threat and reasons), the
// rules this account can see, the garden's planting log, its "in flower" marks,
// and who's in the garden.
// Log entries go through the outbox (outbox.ts); the last good load is kept.

import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import { queue, readOps, type Op } from './outbox'
import { CACHES, findGardenId, readJson, useLiveTable, useLoadWhenBack, writeJson } from './local'
import type { FullPlant, Planting, Rule } from './plants'
import { plantKey } from './plan'
import type { BloomMark } from './pollinators'

export interface Catalogue {
  gardenId: string | null
  plants: FullPlant[]
  rules: Rule[]
  plantings: Planting[]
  bloomMarks: BloomMark[]
  members: Record<string, string> // user id -> initials
  fromPhone?: boolean
}

function applyLog(data: Catalogue, ops: Op[]): Catalogue {
  let plantings = data.plantings
  let plants = data.plants
  let bloomMarks = data.bloomMarks
  for (const op of ops) {
    if (op.kind === 'bloom-insert' && !bloomMarks.some((m) => m.id === op.row.id)) bloomMarks = [...bloomMarks, op.row as unknown as BloomMark]
    else if (op.kind === 'bloom-delete') bloomMarks = bloomMarks.filter((m) => m.id !== op.id)
    if (op.kind === 'planting-insert' && !plantings.some((p) => p.id === op.row.id))
      plantings = [...plantings, op.row as unknown as Planting]
    else if (op.kind === 'planting-delete') plantings = plantings.filter((p) => p.id !== op.id)
    else if (op.kind === 'plant-insert' && !plants.some((p) => p.id === op.row.id))
      // Added in the app and not sent yet: enough to show it.
      plants = [
        ...plants,
        {
          native: false,
          tags: [],
          plant_months: [],
          bloom_months: [],
          pollinator_months: [],
          threat_tier: null,
          threat_reason: null,
          rank: null,
          why: null,
          size: null,
          pollinators: null,
          photo_url: null,
          photo_page: null,
          photo_credit: null,
          ...(op.row as object),
        } as unknown as FullPlant,
      ]
  }
  return { ...data, plantings, plants, bloomMarks }
}

export async function loadCatalogue(userId: string): Promise<Catalogue> {
  try {
    const gardenId = await findGardenId(userId)
    if (!gardenId) return { gardenId: null, plants: [], rules: [], plantings: [], bloomMarks: [], members: {} }
    const [plants, rules, plantings, members, marks] = await Promise.all([
      supabase
        .from('plants')
        .select(
          'id, key, common, latin, kind, native, tags, plant_months, bloom_months, pollinator_months, threat_tier, threat_reason, rank, why, size, pollinators, photo_url, photo_page, photo_credit',
        )
        .order('common'),
      supabase.from('rules').select('id, topic, verdict, text, plant_id, tag, kind, garden_id, site_id'),
      supabase
        .from('plantings')
        .select('id, garden_id, plant_id, action, site_id, from_site_id, plan_item_id, quantity, happened_on, notes, done_by')
        .eq('garden_id', gardenId)
        .order('happened_on', { ascending: false }),
      supabase.from('members').select('user_id, initials').eq('garden_id', gardenId),
      supabase.from('bloom_marks').select('id, plant_id, year, month, marked_by, marked_at').eq('garden_id', gardenId),
    ])
    const error = plants.error ?? rules.error ?? plantings.error ?? members.error ?? marks.error
    if (error) throw error
    const data: Catalogue = {
      gardenId,
      plants: plants.data as FullPlant[],
      rules: rules.data as Rule[],
      plantings: plantings.data as Planting[],
      bloomMarks: marks.data as BloomMark[],
      members: Object.fromEntries((members.data ?? []).map((m) => [m.user_id as string, m.initials as string])),
    }
    writeJson(CACHES.plants, { ...data, userId })
    return applyLog(data, readOps())
  } catch (error) {
    const cached = readJson<(Catalogue & { userId: string }) | null>(CACHES.plants, null)
    // A cache from before in-flower marks has none.
    if (cached?.userId === userId) return { ...applyLog({ ...cached, bloomMarks: cached.bloomMarks ?? [] }, readOps()), fromPhone: true }
    throw error
  }
}

export type NewPlanting = Omit<Planting, 'id' | 'garden_id' | 'done_by'>

export function useCatalogue(userId: string) {
  const [data, setData] = useState<Catalogue | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    loadCatalogue(userId)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch(() => setError("Couldn't load the plants. Check your connection and try again."))
  }, [userId])

  useLoadWhenBack(reload)
  const gardenId = data?.gardenId
  useLiveTable('plantings', gardenId, reload)
  useLiveTable('bloom_marks', gardenId, reload)

  const change = useCallback((op: Op) => {
    setData((prev) => (prev ? applyLog(prev, [op]) : prev))
    void queue(op)
  }, [])

  const record = useCallback(
    (entry: NewPlanting) => {
      if (!gardenId) return
      change({ kind: 'planting-insert', row: { id: crypto.randomUUID(), garden_id: gardenId, done_by: userId, ...entry } })
    },
    [change, gardenId, userId],
  )

  const removeEntry = useCallback((id: string) => change({ kind: 'planting-delete', id }), [change])

  // In flower this month: one mark per plant per month.
  const markBloom = useCallback(
    (plantId: string, year: number, month: number) => {
      if (!gardenId) return
      if (data?.bloomMarks.some((m) => m.plant_id === plantId && m.year === year && m.month === month)) return
      const row = { id: crypto.randomUUID(), garden_id: gardenId, plant_id: plantId, year, month, marked_by: userId, marked_at: new Date().toISOString() }
      change({ kind: 'bloom-insert', row })
    },
    [change, data, gardenId, userId],
  )
  const unmarkBloom = useCallback((id: string) => change({ kind: 'bloom-delete', id }), [change])

  // A plant that isn't in the catalogue yet (the plant picker). Returns its id.
  const addPlant = useCallback(
    (common: string, kind: string) => {
      const taken = new Set((data?.plants ?? []).map((p) => p.key))
      const row = { id: crypto.randomUUID(), key: plantKey(common, taken), common: common.trim(), latin: null, kind }
      change({ kind: 'plant-insert', row })
      return row.id
    },
    [change, data],
  )

  return { data, error, reload, record, removeEntry, markBloom, unmarkBloom, addPlant }
}
