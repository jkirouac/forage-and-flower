import { useEffect, useState } from 'react'
import Month from './screens/Month'
import Seasons from './screens/Seasons'
import Plants from './screens/Plants'
import Pollinators from './screens/Pollinators'
import Settings from './screens/Settings'
import { NavIcon, type NavKind } from './screens/NavIcon'
import SignIn from './screens/SignIn'
import NewPassword from './screens/NewPassword'
import { configured, hasEmailLink, readEmailLink, setRecoveryPending, useRecoveryPending, useSession, type Arrival } from './lib/supabase'

type Screen = NavKind | 'settings'

const TABS: { id: NavKind; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'plants', label: 'Plants' },
  { id: 'pollinators', label: 'Pollinators' },
]

// The screen lives in the address (#seasons), so Android's back button works between tabs.
function screenFromHash(): Screen {
  const id = location.hash.slice(1)
  return id === 'settings' || TABS.some((t) => t.id === id) ? (id as Screen) : 'month'
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
  const [screen, setScreen] = useState<Screen>(screenFromHash)

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  return (
    <div className="app">
      <main className="screen">
        {screen === 'month' && <Month userId={userId} />}
        {screen === 'seasons' && <Seasons userId={userId} />}
        {screen === 'plants' && <Plants />}
        {screen === 'pollinators' && <Pollinators />}
        {screen === 'settings' && <Settings />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="tab" aria-current={screen === t.id ? 'page' : undefined}>
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
