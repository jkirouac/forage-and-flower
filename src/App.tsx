import { useEffect, useState } from 'react'
import Month from './screens/Month'
import Seasons from './screens/Seasons'
import Plants from './screens/Plants'
import PlantPage from './screens/PlantPage'
import Pollinators from './screens/Pollinators'
import Settings from './screens/Settings'
import { NavIcon, type NavKind } from './screens/NavIcon'
import SignIn from './screens/SignIn'
import NewPassword from './screens/NewPassword'
import { siteFromHash } from './lib/yard'
import { monthFromHash } from './lib/pollinators'
import { configured, hasEmailLink, readEmailLink, setRecoveryPending, useRecoveryPending, useSession, type Arrival } from './lib/supabase'

type Screen = NavKind | 'settings' | 'plant'
interface Route {
  screen: Screen
  plantId?: string
  site?: number // a site chosen on the Plants map (#plants/site/4)
  month?: number // a month chosen on the Pollinators ring (#pollinators/month/12)
}

const TABS: { id: NavKind; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'seasons', label: 'Shopping' },
  { id: 'plants', label: 'Plants' },
  { id: 'pollinators', label: 'Pollinators' },
]

// The screen lives in the address (#seasons, #plant/<id>), so Android's back button
// works between tabs and back from a plant page.
function routeFromHash(): Route {
  const id = location.hash.slice(1)
  if (id.startsWith('plant/')) return { screen: 'plant', plantId: decodeURIComponent(id.slice(6)) }
  const site = siteFromHash(id)
  if (site !== null) return { screen: 'plants', site }
  const month = monthFromHash(id)
  if (month !== null) return { screen: 'pollinators', month }
  return { screen: id === 'settings' || TABS.some((t) => t.id === id) ? (id as Screen) : 'month' }
}

export default function App() {
  const session = useSession()
  // A reset or confirm link is checked before deciding what to show.
  const [checkingLink, setCheckingLink] = useState(hasEmailLink)
  const [arrival, setArrival] = useState<Arrival>(null)
  const recoveryPending = useRecoveryPending()

  useEffect(() => {
    void readEmailLink().then((a) => {
      setArrival(a)
      setCheckingLink(false)
    })
  }, [])

  if (!configured) {
    return (
      <div className="app">
        <main className="screen">
          <p className="empty">This copy of the app isn't connected to a database.</p>
        </main>
      </div>
    )
  }
  if (checkingLink || session === undefined) return null
  if (recoveryPending && session) return <NewPassword onDone={() => setRecoveryPending(false)} />
  if (!session) return <SignIn arrival={arrival} />
  return <Garden userId={session.user.id} />
}

function Garden({ userId }: { userId: string }) {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const { screen, plantId, site, month } = route

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen, plantId])

  return (
    <div className="app">
      <main className="screen">
        {screen === 'month' && <Month userId={userId} />}
        {screen === 'seasons' && <Seasons userId={userId} />}
        {screen === 'plants' && <Plants userId={userId} site={site ?? null} />}
        {screen === 'plant' && plantId && <PlantPage key={plantId} userId={userId} plantId={plantId} />}
        {screen === 'pollinators' && <Pollinators userId={userId} month={month ?? null} />}
        {screen === 'settings' && <Settings />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="tab" aria-current={screen === t.id || (screen === 'plant' && t.id === 'plants') ? 'page' : undefined}>
            <span className="tab-icon">
              <NavIcon kind={t.id} />
            </span>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  )
}
