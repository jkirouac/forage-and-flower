// Pollinator picks: plants ranked by support for threatened species, with the year ring on top.
export default function Pollinators() {
  return (
    <>
      <header className="page-head">
        <p className="kicker">Threatened species first</p>
        <h1>Pollinator picks</h1>
      </header>
      <hr className="rule" />
      <p className="empty">
        Plants ranked by how much they help threatened pollinators, each with the reason in plain words, such as{' '}
        <em>winter food for western bumblebee queens</em>. A ring of the year will show when each species needs food and
        what's flowering then.
      </p>
    </>
  )
}
