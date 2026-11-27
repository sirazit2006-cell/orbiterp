import JsBarcode from 'jsbarcode'
import { useEffect, useRef } from 'react'

/** Code 128 barcode of the UHID, readable by any USB barcode scanner at the desk. */
export function Barcode({ value, height = 46 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, { format: 'CODE128', displayValue: false, margin: 0, height: 100, width: 2 })
      ref.current.setAttribute('preserveAspectRatio', 'none')
    }
  }, [value])
  return <div className="bc" style={{ height }}><svg ref={ref} role="img" aria-label={`Barcode ${value}`} /></div>
}
