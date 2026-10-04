import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// After a reset link: the link has already signed this phone in, so all that's
// left is choosing the new password.
export default function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setError(error.message)
      else onDone()
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
          <h1>Choose a new password</h1>
        </header>
        <hr className="rule" />
        <p className="empty">If you use Packed or MealBoard too, this becomes your password there as well.</p>
        <form className="form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            Save password
          </button>
        </form>
      </main>
    </div>
  )
}
