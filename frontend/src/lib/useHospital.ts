import { useEffect, useState } from 'react'
import { get } from '../api/client'
import type { HospitalSettings } from '../api/types'

let cache: HospitalSettings | null = null

export function useHospital(): HospitalSettings | null {
  const [s, setS] = useState<HospitalSettings | null>(cache)
  useEffect(() => {
    if (cache) return
    get<HospitalSettings>('/settings/hospital').then((r) => { cache = r; setS(r) }).catch(() => undefined)
  }, [])
  return s
}
