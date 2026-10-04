import { useState } from 'react'
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
