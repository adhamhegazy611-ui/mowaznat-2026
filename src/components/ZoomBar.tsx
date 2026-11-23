// زووم لعرض الشيت: − / النسبة / + (والنسبة بتتحفظ على الجهاز)
import { useState } from 'react'

const STEPS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
export function useZoom(key: string, def = 1) {
  const [z, setZ] = useState<number>(() => { try { const v = Number(localStorage.getItem('zoom_' + key)); return v > 0 ? v : def } catch { return def } })
  const set = (v: number) => { const n = Math.max(0.3, Math.min(2, Math.round(v * 100) / 100)); setZ(n); try { localStorage.setItem('zoom_' + key, String(n)) } catch { /* */ } }
  return [z, set] as const
}
export function ZoomBar({ z, set, fit }: { z: number; set: (v: number) => void; fit?: () => void }) {
  const dn = () => set([...STEPS].reverse().find((s) => s < z - 0.001) ?? 0.3)
  const up = () => set(STEPS.find((s) => s > z + 0.001) ?? 2)
  const b = { minWidth: 34, padding: '0 8px', fontWeight: 800 } as const
  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="زووم">
      <button type="button" className="btn small" style={b} onClick={dn}>−</button>
      <button type="button" className="btn small" style={{ minWidth: 58 }} onClick={() => set(1)} title="رجّعها 100%">{Math.round(z * 100)}%</button>
      <button type="button" className="btn small" style={b} onClick={up}>+</button>
      {fit && <button type="button" className="btn small" onClick={fit}>↔ على قد الشاشة</button>}
    </div>
  )
}
