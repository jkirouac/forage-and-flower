// Light is the default on every phone. Dark, or following the phone's own setting,
// is a per-phone choice in Settings. index.html applies it before the first paint.

export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'ff-theme'
const LIGHT_BAR = '#f5f1e6'
const DARK_BAR = '#1a1c18'

export function themePref(): ThemePref {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(pref: ThemePref = themePref()) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? DARK_BAR : LIGHT_BAR)
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    // Storage blocked: the choice still applies until the app is closed.
  }
  applyTheme(pref)
}

// "Match my phone" follows the phone when it switches between light and dark.
export function followPhoneTheme() {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themePref() === 'system') applyTheme('system')
  })
}
