// Movement on the table. Cards glide from where they were to where they are now
// (deck to hand, hand to a line, a line to the Graveyard), and power numbers count up or down.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * After every change to the table, compare where each card is with where it was a
 * moment ago and animate the difference. A card that was not on the table before
 * flies in from its owner's deck.
 */
export function useGlide(root: RefObject<HTMLElement>, view: unknown, spd: number) {
  const before = useRef(new Map<string, DOMRect>())
  const live = useRef<Animation[]>([])
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    for (const a of live.current) a.cancel()
    live.current = []
    const nodes = [...el.querySelectorAll<HTMLElement>('[data-uid]')]
    const now = new Map<string, DOMRect>()
    for (const n of nodes) now.set(n.dataset.uid!, n.getBoundingClientRect())
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (before.current.size && !calm) {
      let fresh = 0
      for (const n of nodes) {
        const to = now.get(n.dataset.uid!)!
        if (!to.width) continue
        let from = before.current.get(n.dataset.uid!)
        const isNew = !from
        if (!from) from = el.querySelector<HTMLElement>(`[data-deck="${n.dataset.side}"]`)?.getBoundingClientRect()
        if (!from || !from.width) continue
        const dx = from.left + from.width / 2 - (to.left + to.width / 2)
        const dy = from.top + from.height / 2 - (to.top + to.height / 2)
        const scale = from.width / to.width
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && Math.abs(scale - 1) < 0.04) continue
        const far = Math.hypot(dx, dy) > 60
        n.classList.add('gliding')
        const a = n.animate(
          far
            ? [
                { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: isNew ? 0.2 : 1 },
                { transform: `translate(${dx * 0.03}px, ${dy * 0.03 - 12}px) scale(1.08)`, opacity: 1, offset: 0.8 },
                { transform: 'none', opacity: 1 },
              ]
            : [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'none' }],
          { duration: (far ? 520 : 260) / spd, delay: isNew ? (fresh++ * 90) / spd : 0, fill: 'backwards', easing: 'cubic-bezier(0.22, 0.8, 0.25, 1)' },
        )
        const done = () => n.classList.remove('gliding')
        a.onfinish = done
        a.oncancel = done
        live.current.push(a)
      }
    }
    before.current = now
  }, [view])
}

/** A power number that counts to its new value instead of jumping. */
export function PowerNum({ value, from, lead, spd }: { value: number; from: number; lead: boolean; spd: number }) {
  const [shown, setShown] = useState(from)
  const at = useRef(from)
  useEffect(() => {
    const start = at.current
    if (start === value) { setShown(value); return }
    const t0 = performance.now()
    const dur = 520 / spd
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const eased = 1 - (1 - k) * (1 - k)
      at.current = start + (value - start) * eased
      setShown(k < 1 ? Math.round(at.current / 100) * 100 : value)
      if (k < 1) raf = requestAnimationFrame(step)
      else at.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const moving = shown !== value
  return <span className={`pw ${lead ? 'lead' : ''} ${moving ? (value > shown ? 'rising' : 'falling') : ''}`}>{shown}</span>
}
