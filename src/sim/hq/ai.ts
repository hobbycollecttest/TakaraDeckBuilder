// The computer player for Haikyu. It plays by the same rules as a person and only uses
// what a person in its seat could see: its own hand and the cards that are face up.
import { HQ, type Opt, type Side } from './engine.js'
import { EFFORT, LEVELS, searchChoice, shuffleSlots, type Effort, type Level, type SearchGame } from '../search.js'

export { LEVELS, type Level }

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

export function cpuChoice(g: HQ, level: Level, rnd: () => number = Math.random, effort?: Effort): number {
  const count = g.req!.opts.length
  if (count <= 1) return 0
  // Beginner plays like Easy, but about a third of the time it just does something legal (never giving the set away).
  if (level === 'beginner') {
    const legal = g.req!.opts.map((x, i) => (x.t === 'lost' ? -1 : i)).filter((i) => i >= 0)
    return rnd() < 0.35 && legal.length ? legal[Math.floor(rnd() * legal.length)] : habit(g, 'easy', rnd)
  }
  if (level === 'easy' || level === 'normal') return habit(g, level, rnd)
  return searchChoice(searchGame(g), count, habit(g, 'normal', rnd), effort ?? EFFORT[level]!, rnd)
}

/** Everything the player to move cannot see is reshuffled: the other hand, both decks and the Score cards. */
function searchGame(real: HQ): SearchGame<HQ> {
  const me = real.req!.p
  const shown = new Set<number>([...(real.req!.show ?? []), ...real.req!.opts.map((x) => x.uid).filter((u): u is number => u != null)])
  return {
    copy: () => HQ.replay(real.setup, real.answers),
    hide: (m, rnd) => {
      m.rand = rnd
      for (const side of [0, 1] as Side[]) {
        const P = m.P(side)
        const slots: { get: () => number; set: (u: number) => void }[] = []
        const list = (arr: number[]) => arr.forEach((u, i) => { if (!shown.has(u)) slots.push({ get: () => arr[i], set: (v) => { arr[i] = v } }) })
        list(P.deck)
        list(P.score)
        if (side !== me) list(P.hand)
        shuffleSlots(slots, rnd)
      }
    },
    open: (m) => !!m.req,
    options: (m) => m.req!.opts.length,
    answer: (m, i) => m.answer(i),
    habit: (m, rnd) => habit(m, 'normal', rnd),
    result: (m) => {
      if (m.s.winner != null) return m.s.winner === me ? 1 : 0
      const diff = m.P(me).score.length - m.P((1 - me) as Side).score.length
      return 0.5 + Math.max(-0.4, Math.min(0.4, diff * 0.2))
    },
  }
}

function habit(g: HQ, level: 'easy' | 'normal', rnd: () => number): number {
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
