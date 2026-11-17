// The computer player for Haikyu. It plays by the same rules as a person and only uses
// what a person in its seat could see: its own hand and the cards that are face up.
import type { HQ, Opt, Side } from './engine.js'

export type Level = 'easy' | 'normal'

const best = (opts: Opt[], score: (o: Opt) => number) => {
  let at = 0
  let top = -Infinity
  opts.forEach((o, i) => { const v = score(o); if (v > top) { top = v; at = i } })
  return at
}

/** The total Block Point the computer could put up from its hand. */
function blockPlan(g: HQ, p: Side, need: number) {
  const pool = g.P(p).hand.filter((u) => g.canEnter(p, u, 'center')).sort((a, b) => (g.def(b).bl ?? 0) - (g.def(a).bl ?? 0))
  const names = new Set<string>()
  const picks: number[] = []
  let sum = 0
  for (const u of pool) {
    if (picks.length >= 3 || names.has(g.def(u).name)) continue
    picks.push(u)
    names.add(g.def(u).name)
    sum += g.def(u).bl ?? 0
    if (sum >= need) break
  }
  return { sum, picks }
}

export function cpuChoice(g: HQ, level: Level, rnd: () => number = Math.random): number {
  const req = g.req!
  const p = req.p
  const o = (1 - p) as Side
  const P = g.P(p)
  const opts = req.opts
  const find = (t: string) => opts.findIndex((x) => x.t === t)
  const off = g.s.off[o] ?? 0
  const sloppy = level === 'easy' ? () => rnd() * 2 : () => 0

  if (req.kind === 'mulligan') {
    const chars = P.hand.filter((u) => g.isChar(u)).length
    return find(chars >= 3 || level === 'easy' ? 'keep' : 'pick')
  }

  if (req.kind === 'start') {
    const chars = P.hand.filter((u) => g.isChar(u))
    const bestRc = Math.max(-1, ...chars.map((u) => g.def(u).rc ?? -1))
    const setters = chars.filter((u) => (g.def(u).st ?? -1) >= 0).length
    const attackers = chars.filter((u) => g.def(u).at != null).length
    const canReceive = bestRc + 1 >= off && chars.length >= 3 && setters >= 1 && attackers >= 2
    const plan = blockPlan(g, p, off)
    const canBlock = find('block') >= 0 && plan.sum >= off
    if (canReceive && (off > 0 || !canBlock || level === 'easy')) return find('receive')
    if (canBlock) return find('block')
    if (find('block') >= 0 && plan.sum > bestRc) return find('block')
    return find('receive')
  }

  if (req.kind === 'enter') {
    const lost = find('lost')
    const done = find('done')
    const cand = opts.filter((x) => x.t === 'enter')
    if (!cand.length) return done >= 0 ? done : lost
    const area = cand[0].area!
    const value = (u: number) => g.worth(u)
    if (area === 'center' || area === 'sides') {
      const blocked = g.blockers(p).reduce((a, x) => a + (g.param(x.uid, 'bl') ?? 0), 0)
      if (area === 'sides' && blocked >= off && done >= 0) return done
      return best(opts, (x) => (x.t === 'enter' ? (g.def(x.uid!).bl ?? 0) * 3 - value(x.uid!) * 0.3 + sloppy() : -99))
    }
    if (area === 'serve') return best(opts, (x) => (x.t === 'enter' ? (g.def(x.uid!).sv ?? 0) * 2 - Math.max(g.def(x.uid!).rc ?? 0, g.def(x.uid!).at ?? 0) * 0.6 + sloppy() : -99))
    if (area === 'receive') {
      // The cheapest card that still makes the receive, keeping a setter and an attacker in hand.
      return best(opts, (x) => {
        if (x.t !== 'enter') return -99
        const d = g.def(x.uid!)
        const rest = P.hand.filter((u) => u !== x.uid && g.isChar(u))
        const keeps = rest.some((u) => g.def(u).st != null) && rest.some((u) => g.def(u).at != null) ? 2 : 0
        const rc = d.rc ?? 0
        const makes = rc >= off ? 20 - (rc - off) : rc - off
        return makes + keeps - (d.at ?? 0) * 0.3 + sloppy()
      })
    }
    if (area === 'set') return best(opts, (x) => {
      if (x.t !== 'enter') return -99
      const rest = P.hand.filter((u) => u !== x.uid && g.isChar(u) && g.def(u).at != null && g.def(u).name !== g.def(x.uid!).name)
      return (g.def(x.uid!).st ?? 0) * 4 + (rest.length ? 3 : -10) - (g.def(x.uid!).at ?? 0) * 0.5 + sloppy()
    })
    return best(opts, (x) => (x.t === 'enter' ? (g.def(x.uid!).at ?? 0) * 3 + (g.sc(x.uid!).enter ? 1 : 0) + sloppy() : -99))
  }

  if (req.kind === 'free') {
    const phase = g.s.phase
    let short = 0
    if (phase === 'receive') { const r = g.top(p, 'receive'); short = off - (r != null ? g.param(r, 'rc') ?? 0 : 0) }
    if (phase === 'block') short = off - g.blockers(p).reduce((a, x) => a + (g.param(x.uid, 'bl') ?? 0), 0)
    const plays = opts.filter((x) => x.t === 'event' || x.t === 'hand')
    if (!plays.length) return find('done')
    const want = short > 0 || phase === 'attack' || phase === 'draw' || phase === 'serve' || phase === 'set'
    if (!want) return find('done')
    if (level === 'easy' && rnd() < 0.4) return find('done')
    // Keep a card or two for the next turn unless the point is at stake right now.
    if (short <= 0 && P.hand.length <= 3 && phase !== 'draw') return find('done')
    return best(opts, (x) => (x.t === 'event' ? 3 : x.t === 'hand' ? (short > 0 ? 2 : -1) : x.t === 'done' ? 0 : -9))
  }

  if (req.kind === 'name') return 0
  return best(opts, (x) => (x.w ?? 0) + sloppy() * 0.2)
}
