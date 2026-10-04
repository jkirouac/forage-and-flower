import { useState, type FormEvent } from 'react'
import { siteUrl, supabase, type Arrival } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up' | 'forgot'

const TITLES: Record<Mode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create an account',
  forgot: 'Forgotten password',
}

// Sign-in, sign-up and the forgotten-password request. One login covers the
// other apps on the same account, so a Packed or MealBoard password works here.
export default function SignIn({ arrival }: { arrival: Arrival }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  function switchTo(next: Mode) {
    setMode(next)
    setError('')
    setSent('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSent('')
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(signInError(error.message))
      } else if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { app: 'garden' }, emailRedirectTo: siteUrl },
        })
        if (error) setError(error.message)
        else
          setSent(
            'If this email is new, a link to confirm it is on its way. Already use Packed or MealBoard? Sign in with that password instead.',
          )
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl })
        if (error) setError(error.message)
        else setSent('If there is an account for this email, a link to set a new password is on its way. Check spam too.')
      }
    } catch {
      setError('No connection. Try again when you have signal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <main className="screen">
        <header className="page-head">
          <p className="kicker">Forage &amp; Flower</p>
          <h1>{TITLES[mode]}</h1>
        </header>
        <hr className="rule" />
        {arrival === 'confirmed' && <p className="notice">Your email is confirmed. Sign in to carry on.</p>}
        {arrival === 'link-failed' && (
          <p className="notice notice-error">That link has expired or was already used. Ask for a new one below.</p>
        )}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              Password
              <input
                type="password"
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                minLength={mode === 'sign-up' ? 8 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          {sent && (
            <p className="notice" role="status">
              {sent}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            {mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send me a link'}
          </button>
        </form>
        <div className="form-links">
          {mode !== 'sign-in' && (
            <button type="button" className="text-button" onClick={() => switchTo('sign-in')}>
              Back to sign in
            </button>
          )}
          {mode === 'sign-in' && (
            <>
              <button type="button" className="text-button" onClick={() => switchTo('forgot')}>
                Forgotten your password?
              </button>
              <button type="button" className="text-button" onClick={() => switchTo('sign-up')}>
                New here? Create an account
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function signInError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Try again, or set a new password.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: the link is in the email we sent when you signed up.'
  return message
}
