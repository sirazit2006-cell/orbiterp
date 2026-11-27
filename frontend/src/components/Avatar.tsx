import { useEffect, useState } from 'react'
import { apiBlob } from '../api/client'
import { initials } from '../lib/format'

/** Initials, or the patient's photo when one is on file (fetched with the auth header). */
export function Avatar({ name, patientId, hasPhoto, large = false, version = 0 }: {
  name: string; patientId?: number; hasPhoto?: boolean; large?: boolean; version?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!hasPhoto || !patientId) { setSrc(null); return }
    let url: string | null = null
    let alive = true
    apiBlob(`/patients/${patientId}/photo`).then((b) => {
      if (!alive) return
      url = URL.createObjectURL(b)
      setSrc(url)
    }).catch(() => setSrc(null))
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [patientId, hasPhoto, version])

  return <span className={large ? 'av lg' : 'av'}>{src ? <img src={src} alt="" /> : initials(name)}</span>
}
