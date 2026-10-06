// Links to a site's design files in the garden's private bucket. Signed links last
// an hour; with no signal the plain path is used, which the service worker answers
// from its cache for any file already opened on this phone (vite.config.ts).

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Design } from './plan'

const BUCKET = 'garden-designs'
const HOUR = 60 * 60

export const designPath = (gardenId: string, site: number, file: string) => `${gardenId}/${site}/${file}`

const plainUrl = (path: string) => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`

// File name -> link, for every file and thumbnail of one site.
export function useDesignUrls(gardenId: string | null, site: number, designs: Design[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const files = designs.flatMap((d) => [d.file, d.thumb].filter((f): f is string => !!f))
  const key = `${gardenId}:${site}:${files.join(',')}`

  useEffect(() => {
    if (!gardenId || files.length === 0) return
    let live = true
    const paths = files.map((f) => designPath(gardenId, site, f))
    const fallback = Object.fromEntries(files.map((f, i) => [f, plainUrl(paths[i])]))
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, HOUR)
      .then(({ data, error }) => {
        if (!live) return
        if (error || !data) return setUrls(fallback)
        setUrls(Object.fromEntries(files.map((f, i) => [f, data[i]?.signedUrl ?? fallback[f]])))
      })
      .catch(() => live && setUrls(fallback))
    return () => {
      live = false
    }
    // The key covers the garden, site and files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return urls
}
