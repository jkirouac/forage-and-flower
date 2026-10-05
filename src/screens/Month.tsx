import { monthHeading } from '../lib/season'

// This month: the shared checklist under Do / Plant / Buy, then "Plant now".
// The checklist arrives with the database (build step 3); until then the
// screen shows what will appear here.
export default function Month() {
  const { month, theme } = monthHeading()
  return (
    <>
      <header className="page-head">
        <div className="head-row">
          <p className="kicker">{month} · Victoria 9a</p>
          <a className="icon-link" href="#settings" aria-label="Settings">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </a>
        </div>
        <h1>{theme}</h1>
      </header>
      <hr className="rule" />
      {(['Do', 'Plant', 'Buy'] as const).map((section) => (
        <section key={section} className="block">
          <h2 className="label">{section}</h2>
          <p className="empty">{EMPTY[section]}</p>
        </section>
      ))}
    </>
  )
}

const EMPTY = {
  Do: 'Jobs for the month, like trimming the nepeta or cranking the Worm Wigwam, will be listed here. Tick one off and your initials go beside it.',
  Plant: 'What goes in the ground this month, with the site for each.',
  Buy: 'Plants to pick up this month, grouped by nursery.',
}
