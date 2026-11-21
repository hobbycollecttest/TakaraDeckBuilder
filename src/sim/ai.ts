// The CPU opponent. It plays by the same rules as a person and only looks at what a
// person in its seat could see: its own hand and the cards that are face up.
import { Match, type Opt, type Side } from './engine'
import { EFFORT, LEVELS, searchChoice, shuffleSlots, type Effort, type Level, type SearchGame } from './search'

export { EFFORT, LEVELS, type Level }

const best = (opts: Opt[], score: (o: Opt, i: number) => number) => {
  let at = 0
  let top = -Infinity
  opts.forEach((o, i) => { const v = score(o, i); if (v > top) { top = v; at = i } })
  return at
}

/** How much the CPU wants to hold on to a card in its hand. */
function keepValue(m: Match, p: Side, uid: number) {
  const P = m.P(p)
  const d = m.def(uid)
  const ena = P.ena.length
  const twins = P.hand.filter((u) => m.name(u) === d.name).length - 1
  if (d.type === 'Waza') return 3.2 - (P.hand.filter((u) => m.def(u).type === 'Waza').length > 2 ? 1 : 0) - twins * 0.3
  const soon = d.cost <= ena + 1 ? 6 : d.cost <= ena + 3 ? 4 : 2
  return soon + d.power / 20000 - twins * 0.5
}

export function cpuChoice(m: Match, level: Level, rnd: () => number = Math.random, effort?: Effort): number {
  const count = m.req!.opts.length
  if (count <= 1) return 0
  // Beginner plays like Easy, but about a third of the time it just does something legal.
  if (level === 'beginner') return rnd() < 0.35 ? Math.floor(rnd() * count) : habit(m, 'easy', rnd)
  if (level === 'easy' || level === 'normal') return habit(m, level, rnd)
  return searchChoice(searchGame(m), count, habit(m, 'normal', rnd), effort ?? EFFORT[level]!, rnd)
}

/** Everything the player to move cannot see is reshuffled: the other hand, both decks and the Hearts. */
function searchGame(real: Match): SearchGame<Match> {
  const me = real.req!.p
  const shown = new Set<number>([...(real.req!.show ?? []), ...real.req!.opts.map((x) => x.uid).filter((u): u is number => u != null)])
  return {
    copy: () => Match.replay(real.setup, real.answers),
    hide: (m, rnd) => {
      ;(m as unknown as { rand: () => number }).rand = rnd
      for (const side of [0, 1] as Side[]) {
        const P = m.P(side)
        const slots: { get: () => number; set: (u: number) => void }[] = []
        const list = (arr: number[]) => arr.forEach((u, i) => { if (!shown.has(u)) slots.push({ get: () => arr[i], set: (v) => { arr[i] = v } }) })
        list(P.deck)
        if (side !== me) list(P.hand)
        P.hearts.forEach((h) => { if (!shown.has(h.uid)) slots.push({ get: () => h.uid, set: (v) => { h.uid = v } }) })
        shuffleSlots(slots, rnd)
      }
    },
    open: (m) => !!m.req,
    options: (m) => m.req!.opts.length,
    answer: (m, i) => m.answer(i),
    habit: (m, rnd) => habit(m, 'normal', rnd),
    result: (m) => {
      if (m.s.winner != null) return m.s.winner === me ? 1 : 0
      const diff = m.countH(me) - m.countH((1 - me) as Side)
      return 0.5 + Math.max(-0.4, Math.min(0.4, diff * 0.1))
    },
  }
}

function habit(m: Match, level: 'easy' | 'normal', rnd: () => number): number {
  const req = m.req!
  const p = req.p
  const o = (1 - p) as Side
  const P = m.P(p)
  const opts = req.opts
  const find = (t: string) => opts.findIndex((x) => x.t === t)

  if (req.kind === 'mulligan') {
    if (level === 'easy') return find('keep')
    const early = P.hand.filter((u) => m.def(u).type === 'Horobeat' && m.def(u).cost <= 3).length
    return find(early >= 2 ? 'keep' : 'mulligan')
  }

  if (req.kind === 'charge') {
    const ena = P.ena.length
    const wantsMore = ena < 6 || (ena < 9 && P.hand.length >= 3 && P.hand.some((u) => m.def(u).cost > ena))
    if (!wantsMore) return find('skip')
    // A color the hand needs but the Ena Zone lacks is worth charging first.
    const have = new Set(P.ena.map((e) => m.def(e.uid).color))
    return best(opts, (x) => {
      if (x.t !== 'charge') return -100
      const d = m.def(x.uid!)
      const opensColor = !have.has(d.color) && P.hand.some((u) => u !== x.uid && m.def(u).color === d.color)
      return -keepValue(m, p, x.uid!) + (opensColor ? 3 : 0)
    })
  }

  if (req.kind === 'main') {
    const free = m.unused(p)
    const hasTrick = P.hand.some((u) => m.def(u).type === 'Waza' || m.def(u).boost > 0)
    const behind = m.countH(p) < m.countH(o)
    const reserve = level === 'normal' && hasTrick && m.s.round >= 2 && !behind && m.countH(p) >= 2 ? 1 : 0
    let pick = find('end')
    let top = 0.55
    opts.forEach((x, i) => {
      if (x.t !== 'play') return
      const d = m.def(x.uid!)
      let value: number
      let paid: number
      if (x.via === 'new') {
        paid = d.cost
        value = 4 + d.power / 1500
      } else {
        const base = m.top(p, x.line!)!
        paid = Math.max(0, d.cost - m.costInLine(base))
        value = (d.power - m.def(base).power) / 1500 + (m.isDown(p, x.line!) ? 3.5 : 0) + 0.2
      }
      if (free - paid < reserve) return
      const v = value / (paid + 1) + (level === 'easy' ? rnd() * 0.8 : 0)
      if (v > top) { top = v; pick = i }
    })
    return pick
  }

  if (req.kind === 'battle') {
    const line = m.s.line
    const pass = find('pass')
    if (m.top(o, line) == null) return pass
    const theirs = m.power(o, line)
    const mine = m.power(p, line)
    if (mine > theirs) return pass
    if (level === 'easy' && rnd() < 0.4) return pass
    const zone = P.waza[line]
    const plays = opts.map((x, i) => {
      if (x.t === 'pass') return null
      const d = m.def(x.uid!)
      zone.push({ uid: x.uid!, boost: x.t === 'boost' })
      const gain = m.power(p, line) - mine
      const theirsAfter = m.power(o, line)
      zone.pop()
      return { i, gain: gain - (theirsAfter - theirs), cost: x.t === 'boost' ? 1 : d.cost }
    }).filter((x): x is { i: number; gain: number; cost: number } => !!x && x.gain > 0)
    const need = theirs - mine
    const winners = plays.filter((x) => x.gain > need).sort((a, b) => a.cost - b.cost || a.gain - b.gain)
    if (winners.length) return winners[0].i
    // No single card wins it. Start a chain only if everything affordable would be enough.
    let budget = m.unused(p)
    let total = 0
    const chain = [...plays].sort((a, b) => b.gain / b.cost - a.gain / a.cost)
    for (const x of chain) if (x.cost <= budget) { budget -= x.cost; total += x.gain }
    return total > need && chain.length ? chain[0].i : pass
  }

  // Everything else carries a hint from the card that asked: take the best-rated choice.
  return best(opts, (x) => x.w ?? 0)
}
