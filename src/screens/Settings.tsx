import { useEffect, useState } from 'react'
import { supabase, useSession } from '../lib/supabase'
import { setThemePref, themePref, type ThemePref } from '../lib/theme'
import { useInstall } from '../lib/install'

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match my phone' },
]

export default function Settings() {
  const [theme, setTheme] = useState(themePref)
  const install = useInstall()
  const session = useSession()
  const userId = session?.user.id
  // undefined while loading, null when this account isn't in a garden yet.
  const [initials, setInitials] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!userId) return
    void supabase
      .from('members')
      .select('initials')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => setInitials(error ? undefined : (data?.initials ?? null)))
  }, [userId])

  return (
    <>
      <header className="page-head">
        <a className="back" href="#month">
          ← This month
        </a>
        <h1>Settings</h1>
      </header>
      <hr className="rule" />
      <section className="block">
        <h2 className="label">Appearance</h2>
        <div className="choices" role="radiogroup" aria-label="Appearance">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className="choice"
              onClick={() => {
                setThemePref(t.id)
                setTheme(t.id)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
      <section className="block">
        <h2 className="label">Account</h2>
        <p className="empty">
          Signed in as {session?.user.email}
          {initials ? `. Your ticks show ${initials}.` : '.'}
        </p>
        {initials === null && (
          <p className="empty">This account isn't part of a garden yet. Ask whoever runs your garden to add you.</p>
        )}
        <button type="button" className="choice" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
      {!install.installed && (
        <section className="block">
          <h2 className="label">Home screen</h2>
          {install.canPrompt ? (
            <button type="button" className="button" onClick={() => void install.prompt()}>
              Add to home screen
            </button>
          ) : (
            <p className="empty">In Chrome, open the ⋮ menu and choose Add to home screen.</p>
          )}
        </section>
      )}
    </>
  )
}
