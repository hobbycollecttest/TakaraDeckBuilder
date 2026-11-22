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

/**
 * Is there a reason to stack this card on one that only just came down? Playing a small Horobeat and
 * covering it in the same turn costs the same Ena as playing the big one alone, and spends an extra card.
 * It is worth it only when a card cares about the stack, or it is the only way to pay the color.
 */
function stackingPays(m: Match, p: Side, uid: number, line: number, paying = true) {
  const P = m.P(p)
  const base = m.top(p, line)!
  const d = m.def(uid)
  const text = (u: number) => m.def(u).effect || ''
  if (/Overbeat onto this/i.test(text(base)) && !/is downed/i.test(text(base))) return true
  if (/cards? under(neath)? (this|it)/i.test(text(uid))) return true
  if (P.hand.some((u) => u !== uid && m.def(u).type === 'Waza' && /(1|2) or more cards underneath/i.test(text(u)))) return true
  // Covering a card of the same color waives the color requirement.
  return paying && !P.ena.some((e) => m.def(e.uid).color === d.color)
}

/** Paying to cover a Horobeat that came down this very turn, with nothing to gain from the stack. */
function coversFresh(m: Match, x: Opt) {
  const req = m.req!
  if (req.kind !== 'main' || x.t !== 'play' || x.via !== 'over' || x.uid == null || x.line == null) return false
  const st = m.P(req.p).lines[x.line]
  return !!st && !st.down && st.at === m.turnStamp() && !stackingPays(m, req.p, x.uid, x.line)
}

/**
 * On a free play (a trigger or an effect), covering a standing Horobeat when the same card could take
 * an empty line, unless the bigger card turns a losing line into a winning one.
 */
function coversOnFreePlay(m: Match, x: Opt) {
  const req = m.req!
  if (x.via !== 'over' || x.uid == null || x.line == null) return false
  if (x.t !== 'trig-play' && !(req.kind === 'pick' && x.t === 'play')) return false
  const p = req.p
  const st = m.P(p).lines[x.line]
  if (!st || st.down) return false
  if (!req.opts.some((y) => y.uid === x.uid && y.via === 'new')) return false
  if (stackingPays(m, p, x.uid, x.line, false)) return false
  const o = (1 - p) as Side
  if (m.top(o, x.line) == null) return true
  const theirs = m.power(o, x.line)
  return !(m.power(p, x.line) <= theirs && m.def(x.uid).power > theirs)
}
const wasteful = (m: Match, x: Opt) => coversFresh(m, x) || coversOnFreePlay(m, x)

/**
 * Adding power to a line that is already being won, or that has no one across from it. Passing loses
 * nothing: if the opponent answers, the turn comes back before the battle is settled. Waza that do
 * something besides add power are left to judgement.
 */
function needless(m: Match, x: Opt) {
  const req = m.req!
  if (req.kind !== 'battle' || (x.t !== 'waza' && x.t !== 'boost') || x.uid == null) return false
  const p = req.p
  const o = (1 - p) as Side
  const line = m.s.line
  if (m.top(o, line) != null && m.power(p, line) <= m.power(o, line)) return false
  const top = m.top(p, line)
  if (x.t === 'boost') return !(top != null && m.sc(top).onBoostUsed)
  const sc = m.rawScript(x.uid)
  return !sc.wazaOnUse && !sc.wazaOnWin && !(top != null && m.sc(top).onWazaUsed)
}

/**
 * What the computer has been taught not to do. Each entry is a mistake a player spotted, written as a
 * test on one choice. Normal avoids them by habit; Hard and Expert never consider them. The bot lab
 * (tools/bot-lab) counts how often each one happens and keeps saved positions to check against.
 */
export const MISTAKES: { id: string; taught: string; what: string; is: (m: Match, x: Opt) => boolean }[] = [
  { id: 'cover-fresh', taught: '2026-11-22', what: 'Plays a Horobeat and covers it in the same turn with nothing gained from the stack', is: coversFresh },
  { id: 'cover-on-free-play', taught: '2026-11-22', what: 'On a trigger or free play, covers a standing Horobeat when an empty line was open and the line was not being lost', is: coversOnFreePlay },
  { id: 'needless-power', taught: '2026-11-22', what: 'Uses a Boost or a power-only Waza on a line it is already winning, or with no one across', is: needless },
]

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
    skip: (i) => MISTAKES.some((k) => k.is(real, real.req!.opts[i])),
    result: (m) => {
      if (m.s.winner != null) return m.s.winner === me ? 1 : 0
      const diff = m.countH(me) - m.countH((1 - me) as Side)
      return 0.5 + Math.max(-0.4, Math.min(0.4, diff * 0.1))
    },
  }
}

/** The Normal player as it was when the tutorial was written. The tutorial's suggested moves stay on it so they never change. */
export const tutorChoice = (m: Match) => (m.req!.opts.length <= 1 ? 0 : habit(m, 'normal', Math.random, true))

function habit(m: Match, level: 'easy' | 'normal', rnd: () => number, classic = false): number {
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
    const careful = level === 'normal' && !classic
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
        // Do not cover a Horobeat that came down this very turn unless something gains from the stack.
        if (careful && wasteful(m, x)) return
      }
      if (free - paid < reserve) return
      const v = value / (paid + 1) + (level === 'easy' ? rnd() * 0.8 : 0)
      if (v > top) { top = v; pick = i }
    })
    if (careful && pick >= 0 && opts[pick].t === 'play' && opts[pick].via === 'new') {
      // About to play a small Horobeat when the only thing left to do afterwards would be to cover it
      // with a bigger one? Play the bigger one on its own instead: same Ena, same line, one more card kept.
      const a = m.def(opts[pick].uid!)
      const budget = free - reserve
      const news = opts.filter((x) => x.t === 'play' && x.via === 'new' && x.uid !== opts[pick].uid)
      const otherAfter = news.some((x) => m.def(x.uid!).cost <= budget - a.cost)
      if (!otherAfter && !m.sc(opts[pick].uid!).noOverbeatOnto) {
        const bigger = news
          .filter((x) => {
            const b = m.def(x.uid!)
            if (b.cost <= a.cost || b.cost > budget || m.rawScript(x.uid!).noOverbeatFromHand) return false
            return ((b.power - a.power) / 1500 + 0.2) / (b.cost - a.cost + 1) > 0.55
          })
          .sort((x, y) => m.def(y.uid!).power - m.def(x.uid!).power)[0]
        if (bigger) pick = opts.indexOf(bigger)
      }
    }
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
