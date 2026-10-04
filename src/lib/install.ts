// Putting the diary on the home screen. Android's Chrome offers a one-tap install
// prompt (beforeinstallprompt), which has to be caught as the page loads. iPhones
// have no prompt, so they get the two steps instead.

import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installedNow = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Called once from main.tsx, before the app draws.
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // Our own button asks instead of Chrome's small bar.
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installedNow = true
    deferred = null
    notify()
  })
}

export type InstallPlatform = 'android' | 'ios' | 'other'

function runningInstalled() {
  return (
    installedNow ||
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function platform(): InstallPlatform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export function useInstall() {
  const [, redraw] = useState(0)
  useEffect(() => {
    const listener = () => redraw((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return {
    installed: runningInstalled(),
    canPrompt: deferred !== null,
    platform: platform(),
    // Opens the phone's own install prompt. The prompt can only be used once.
    async prompt(): Promise<boolean> {
      const event = deferred
      if (!event) return false
      deferred = null
      await event.prompt()
      const { outcome } = await event.userChoice
      notify()
      return outcome === 'accepted'
    },
  }
}
