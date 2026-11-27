import { createContext, useContext, useEffect } from 'react'

export type Crumb = string | { label: string; to: string }

export const CrumbCtx = createContext<(c: Crumb[]) => void>(() => {})

/** Sets the browser tab title and the breadcrumb in the top bar. */
export function usePage(title: string, crumbs: Crumb[]) {
  const set = useContext(CrumbCtx)
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    document.title = `${title} · OrbitERP`
    set(JSON.parse(key) as Crumb[])
  }, [title, key, set])
}
