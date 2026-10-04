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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
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
