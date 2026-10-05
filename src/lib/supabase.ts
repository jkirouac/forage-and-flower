import { createClient, type Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

// Public by design: the anon key only allows what row-level security permits.
// Set at build time (environment variables on the Vercel project).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

// Every table lives in the `garden` schema. Email links are read by readEmailLink,
// not by the client, because they carry a token hash rather than a session.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  db: { schema: 'garden' },
  auth: { detectSessionInUrl: false, storageKey: 'ff-auth' },
})

// Where email links come back to: the site root, which reads the token on load.
export const siteUrl = `${location.origin}${import.meta.env.BASE_URL}`

// undefined while the saved session loads (from the phone, so it works offline).
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

export type Arrival = 'recovery' | 'confirmed' | 'link-failed' | null

// A reset link may open in the email app's own browser view while the person
// carries on in another tab, which signs in too (sessions are shared). A flag
// in storage lets whichever tab they're looking at ask for the new password.
const RECOVERY_KEY = 'ff-recovery'

function readRecoveryFlag() {
  try {
    return localStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

export function setRecoveryPending(pending: boolean) {
  try {
    if (pending) localStorage.setItem(RECOVERY_KEY, '1')
    else localStorage.removeItem(RECOVERY_KEY)
  } catch {
    // Storage blocked: only the tab that opened the link asks.
  }
  window.dispatchEvent(new Event('ff-recovery'))
}

export function useRecoveryPending() {
  const [pending, setPending] = useState(readRecoveryFlag)
  useEffect(() => {
    const update = () => setPending(readRecoveryFlag())
    window.addEventListener('storage', update)
    window.addEventListener('ff-recovery', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('ff-recovery', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  return pending
}

export function hasEmailLink() {
  return new URLSearchParams(location.search).has('token_hash')
}

// A reset or confirm email lands on /?token_hash=...&type=recovery|signup.
// Verify it once (React runs effects twice in development), then tidy the address
// so a reload or a shared screenshot doesn't carry the token.
let reading: Promise<Arrival> | undefined
export function readEmailLink(): Promise<Arrival> {
  reading ??= (async () => {
    const params = new URLSearchParams(location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    if (!tokenHash) return null
    history.replaceState(null, '', `${location.pathname}${location.hash}`)
    if (type !== 'recovery' && type !== 'signup') return 'link-failed'
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return 'link-failed'
    if (type === 'recovery') setRecoveryPending(true)
    return type === 'recovery' ? 'recovery' : 'confirmed'
  })()
  return reading
}
