import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { siteContents, type YardSite } from '../lib/yard'
import YardMap from './YardMap'

// Garden, the first tab: the front yard drawn to scale, each site in its colour.
// Tap a site, or its chip, to open its page (#garden/site/4).
export default function Garden({ userId }: { userId: string }) {
  const { data, error, reload } = useCatalogue(userId)
  const seasons = useSeasons(userId)

  const all = data?.plants ?? []
  const items = seasons.data?.items ?? []
  const map = seasons.data?.map ?? null
  const sites: YardSite[] = seasons.data?.sites ?? []
  const counts = Object.fromEntries(
    sites.map((s) => {
      const c = siteContents(s, { plants: all, items, plantings: data?.plantings ?? [], rules: data?.rules ?? [] })
      return [s.number, c.inGround.length + c.onLists.length + c.notesOnly.length]
    }),
  )
  const open = (n: number | null) => {
    if (n !== null) window.location.assign(`#garden/site/${n}`)
  }

  return (
    <>
      <header className="page-head">
        <div className="head-row">
          <p className="kicker">{sites.length ? `Front yard · ${sites.length} sites` : 'Front yard'}</p>
          <a className="icon-link" href="#settings" aria-label="Settings">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </a>
        </div>
        <h1>Garden</h1>
      </header>
      <hr className="rule" />

      {(error || seasons.error) && !(data && seasons.data) && (
        <section className="block">
          <p className="notice notice-error">{error || seasons.error}</p>
          <button
            type="button"
            className="choice"
            onClick={() => {
              reload()
              seasons.reload()
            }}
          >
            Try again
          </button>
        </section>
      )}

      {data && !data.gardenId && (
        <p className="empty">This account isn't part of a garden yet. Ask whoever runs your garden to add you.</p>
      )}

      {data?.gardenId && seasons.data && (
        <>
          {map && sites.length > 0 ? (
            <YardMap map={map} sites={sites} counts={counts} selected={null} onSelect={open} />
          ) : (
            <p className="empty">The garden's map isn't loaded yet.</p>
          )}
          <p className="sync-note">Tap a site to see its designs, plants and to-dos.</p>
        </>
      )}
    </>
  )
}
