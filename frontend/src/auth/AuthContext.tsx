import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as client from '../api/client'
import type { RoleCode, User } from '../api/types'

/** Counters are shared machines: sign out after this long with no keyboard or mouse use. */
const IDLE_MINUTES = 15

interface AuthState {
  user: User | null
  ready: boolean
  notice: string | null
  signIn: (username: string, password: string) => Promise<void>
  signOut: (reason?: string) => Promise<void>
  can: (...roles: RoleCode[]) => boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const idleTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    client.onSessionEnded(() => { setUser(null); setNotice('Your session has ended. Please sign in again.') })
    if (client.hasStoredSession()) {
      client.refreshSession().then((u) => { setUser(u); setReady(true) }).catch(() => setReady(true))
    } else {
      setReady(true)
    }
  }, [])

  const signOut = useCallback(async (reason?: string) => {
    await client.logout(reason)
    setUser(null)
  }, [])

  // Automatic logout after inactivity.
  useEffect(() => {
    if (!user) return
    const reset = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => {
        signOut('inactivity')
        setNotice(`You were signed out after ${IDLE_MINUTES} minutes without activity.`)
      }, IDLE_MINUTES * 60_000)
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(idleTimer.current)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [user, signOut])

  const signIn = useCallback(async (username: string, password: string) => {
    const u = await client.login(username, password)
    setNotice(null)
    setUser(u)
  }, [])

  const can = useCallback((...roles: RoleCode[]) => !!user && user.roles.some((r) => roles.includes(r)), [user])

  return <Ctx.Provider value={{ user, ready, notice, signIn, signOut, can }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
