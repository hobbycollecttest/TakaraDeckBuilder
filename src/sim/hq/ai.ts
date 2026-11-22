// The computer player for Haikyu. It plays by the same rules as a person and only uses
// what a person in its seat could see: its own hand and the cards that are face up.
import { HQ, type Opt, type Side } from './engine.js'
import { EFFORT, LEVELS, dealLeaning, searchChoice, shuffleSlots, type Effort, type Level, type SearchGame } from '../search.js'

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

/** A receiver that meets the attack, a setter and an attacker, all different characters. */
function fullRally(g: HQ, chars: number[], off: number) {
  for (const r of chars) {
    if ((g.def(r).rc ?? -1) < off) continue
    for (const st of chars) {
      if (st === r || g.def(st).st == null || g.def(st).name === g.def(r).name) continue
      for (const a of chars) {
        if (a === r || a === st || g.def(a).at == null) continue
        if (g.def(a).name === g.def(r).name || g.def(a).name === g.def(st).name) continue
        return true
      }
    }
  }
  return false
}

/** The block is certain and the hand could not finish a rally anyway: receiving would throw the point away. */
function mustBlock(g: HQ) {
  const req = g.req!
  if (req.kind !== 'start' || !req.opts.some((x) => x.t === 'block')) return false
  const off = g.s.off[(1 - req.p) as Side] ?? 0
  const chars = g.P(req.p).hand.filter((u) => g.isChar(u))
  return blockPlan(g, req.p, off).sum >= off && !fullRally(g, chars, off)
}

/** A single blocker is enough to stop the ball, and the bot receives anyway. Not always wrong, so it is only a habit, never forbidden. */
function oneBlockerEnough(g: HQ) {
  const req = g.req!
  if (req.kind !== 'start' || !req.opts.some((x) => x.t === 'block')) return false
  const off = g.s.off[(1 - req.p) as Side] ?? 0
  const plan = blockPlan(g, req.p, off)
  return plan.sum >= off && plan.picks.length <= 1
}

/**
 * What the computer has been taught about. `forbid` marks a choice Hard and Expert never consider;
 * the others are habits the lab keeps count of. The bot lab (tools/bot-lab) measures how often each
 * happens and keeps saved positions to check against.
 */
export const MISTAKES: { id: string; taught: string; what: string; forbid: boolean; is: (g: HQ, x: Opt) => boolean }[] = [
  { id: 'receive-when-must-block', taught: '2026-11-22', what: 'Receives when a block was certain and the hand could not finish a rally', forbid: true, is: (g, x) => x.t === 'receive' && mustBlock(g) },
  { id: 'receive-when-one-blocker-enough', taught: '2026-11-22', what: 'Receives when a single blocker would have stopped the ball', forbid: false, is: (g, x) => x.t === 'receive' && oneBlockerEnough(g) },
]

/** One of the computer's own choices in a planned turn: receive or block, then who goes into which area. */
type Step = { kind: 'start' | 'enter'; t: Opt['t']; area?: Opt['area']; uid?: number }
const MAX_PLANS = 14
const MAX_NODES = 70
const WIDTH = 3

/**
 * Whole turns to weigh against each other: receive or block, and for each area the habit's own pick
 * plus the next strongest cards for that job. The first plan is what the Normal habits would do.
 * Only cards in hand right now are planned with; a card drawn mid-turn is weighed when it arrives.
 */
function turnPlans(real: HQ, rnd: () => number): Step[][] {
  const me = real.req!.p
  const turn = real.s.turnNo
  const inHand = new Set(real.P(me).hand)
  const at = (path: number[]) => HQ.replay(real.setup, [...real.answers, ...path])
  const mine = (g: HQ) => !!g.req && g.req.p === me && g.s.turnNo === turn && g.s.winner == null
  const planned = (g: HQ) => mine(g) && (g.req!.kind === 'start' || g.req!.kind === 'enter')
  const settle = (g: HQ, path: number[]) => {
    for (let n = 0; n < 16 && mine(g) && !planned(g); n++) {
      const c = g.req!.opts.length <= 1 ? 0 : habit(g, 'normal', rnd)
      path.push(c)
      g.answer(c)
    }
    return planned(g)
  }
  const stat = (g: HQ, o: Opt) => {
    const d = g.def(o.uid!)
    return o.area === 'receive' ? d.rc ?? 0 : o.area === 'set' ? d.st ?? 0 : o.area === 'attack' ? d.at ?? 0 : o.area === 'serve' ? d.sv ?? 0 : d.bl ?? 0
  }
  const plans: Step[][] = []
  let nodes = 0
  const walk = (path: number[], steps: Step[]) => {
    if (plans.length >= MAX_PLANS || nodes++ > MAX_NODES) return
    const g = at(path)
    if (!planned(g)) { if (steps.length) plans.push(steps); return }
    const req = g.req!
    const fav = habit(g, 'normal', rnd)
    // The habit's pick first, so the first finished plan is the habits' whole turn.
    const order = [fav]
    if (req.kind === 'start') req.opts.forEach((o, i) => { if (i !== fav && !MISTAKES.some((k) => k.forbid && k.is(g, o))) order.push(i) })
    else {
      const names = new Set<string>([req.opts[fav].uid != null ? g.def(req.opts[fav].uid!).name : ''])
      const others = req.opts.map((o, i) => ({ o, i })).filter((e) => e.i !== fav && e.o.t === 'enter' && e.o.uid != null && inHand.has(e.o.uid)).sort((x, y) => stat(g, y.o) - stat(g, x.o))
      for (const e of others) {
        if (order.length >= WIDTH) break
        const name = g.def(e.o.uid!).name
        if (names.has(name)) continue
        names.add(name)
        order.push(e.i)
      }
    }
    for (const i of order) {
      const o = req.opts[i]
      const next = [...path, i]
      const child = at(next)
      const more = settle(child, next)
      const step: Step = { kind: req.kind as 'start' | 'enter', t: o.t, area: o.area, uid: o.uid }
      if (!more) { if (plans.length < MAX_PLANS) plans.push([...steps, step]) } else walk(next, [...steps, step])
    }
  }
  walk([], [])
  return plans
}

/** Carry a plan out on a copy of the match (whose hidden cards may have been reshuffled). Anything unplanned is left to the habits. */
function followPlan(g: HQ, me: Side, turn: number, steps: Step[], rnd: () => number) {
  const mine = () => !!g.req && g.req.p === me && g.s.turnNo === turn && g.s.winner == null
  const planned = () => mine() && (g.req!.kind === 'start' || g.req!.kind === 'enter')
  for (const st of steps) {
    for (let n = 0; n < 16 && mine() && !planned(); n++) g.answer(g.req!.opts.length <= 1 ? 0 : habit(g, 'normal', rnd))
    if (!planned() || g.req!.kind !== st.kind) return
    const i = g.req!.opts.findIndex((o) => o.t === st.t && o.uid === st.uid && o.area === st.area)
    if (i < 0) return
    g.answer(i)
  }
}

/** Hard and Expert at the start of a turn and when filling an area: weigh whole turns, then make the first move of the best one. */
function planTurn(real: HQ, e: Effort, rnd: () => number): number | null {
  const me = real.req!.p
  const turn = real.s.turnNo
  const plans = turnPlans(real, rnd)
  if (plans.length < 2) return null
  const base = searchGame(real, e.flat)
  const first = (i: number) => real.req!.opts.findIndex((o) => o.t === plans[i][0].t && o.uid === plans[i][0].uid && o.area === plans[i][0].area)
  const fresh = new WeakSet<HQ>()
  const game: SearchGame<HQ> = {
    ...base,
    copy: () => { const g = base.copy(); fresh.add(g); return g },
    answer: (g, i) => { if (fresh.has(g)) { fresh.delete(g); followPlan(g, me, turn, plans[i], rnd) } else g.answer(i) },
    skip: undefined,
    doubt: (i) => { const o = real.req!.opts[first(i)]; return !!o && MISTAKES.some((k) => !k.forbid && k.is(real, o)) },
  }
  const choice = first(searchChoice(game, plans.length, 0, e, rnd))
  return choice >= 0 ? choice : null
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
  const e = effort ?? EFFORT[level]!
  if ((g.req!.kind === 'start' || g.req!.kind === 'enter') && !e.stepwise) {
    const planned = planTurn(g, e, rnd)
    if (planned != null) return planned
  }
  return searchChoice(searchGame(g, e.flat), count, habit(g, 'normal', rnd), e, rnd)
}

/** Everything the player to move cannot see is reshuffled: the other hand, both decks and the Score cards. */
/** How a card is sorted when guessing what the other player holds. */
export function handClass(g: HQ, uid: number) {
  if (!g.isChar(uid)) return 'event'
  const d = g.def(uid)
  const top = Math.max(d.rc ?? 0, d.at ?? 0, d.bl ?? 0, d.st ?? 0)
  return top === (d.bl ?? 0) && top > 0 ? 'blocker' : top === (d.at ?? 0) && top > 0 ? 'attacker' : top === (d.rc ?? 0) && top > 0 ? 'receiver' : 'setter'
}
/**
 * How much likelier than chance each kind of card is to be in a player's hand.
 * Measured from the lab's own games (tools/bot-lab/read-stats.ts), not guessed. 1 means no lean.
 */
export const HAND_LEAN: Record<string, number> = {}

export function searchGame(real: HQ, flat = false): SearchGame<HQ> {
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
        if (side === me) { shuffleSlots(slots, rnd); continue }
        const rest = slots.splice(0)
        list(P.hand)
        if (flat) { shuffleSlots([...slots, ...rest], rnd); continue }
        dealLeaning(slots, rest, (u) => HAND_LEAN[handClass(m, u)] ?? 1, rnd)
      }
    },
    open: (m) => !!m.req,
    options: (m) => m.req!.opts.length,
    answer: (m, i) => m.answer(i),
    habit: (m, rnd) => habit(m, 'normal', rnd),
    skip: (i) => MISTAKES.some((k) => k.forbid && k.is(real, real.req!.opts[i])),
    doubt: (i) => MISTAKES.some((k) => !k.forbid && k.is(real, real.req!.opts[i])),
    result: (m) => {
      if (m.s.winner != null) return m.s.winner === me ? 1 : 0
      const diff = m.P(me).score.length - m.P((1 - me) as Side).score.length
      return 0.5 + Math.max(-0.4, Math.min(0.4, diff * 0.2))
    },
  }
}

/**
 * The numbers behind the Normal player's rules of thumb. They were first set by feel and are now tuned
 * by self-play in the bot lab (tools/bot-lab/tune.ts). Whole numbers are counts; the rest are weights.
 */
export const WEIGHTS = {
  mullChars: 3, blockCards: 1,
  blW: 3, blWorth: 0.3,
  svW: 2, svKeep: 0.6,
  rcKeeps: 2, rcOver: 1, rcAt: 0.3,
  stW: 4, stHasAtk: 3, stNoAtk: 10, stAt: 0.5,
  atW: 3, atEnter: 1,
  freeKeep: 3,
}
export type Weights = typeof WEIGHTS
/** The first values, kept for the tutorials' suggested moves so the lessons never change. */
const CLASSIC: Weights = { mullChars: 3, blockCards: 1, blW: 3, blWorth: 0.3, svW: 2, svKeep: 0.6, rcKeeps: 2, rcOver: 1, rcAt: 0.3, stW: 4, stHasAtk: 3, stNoAtk: 10, stAt: 0.5, atW: 3, atEnter: 1, freeKeep: 3 }
/** Lets the bot lab give each seat its own numbers when it tests one set against another. */
export const seatWeights: [Weights | null, Weights | null] = [null, null]

/** The Normal player as it was when the tutorials were written. The tutorials' suggested moves stay on it so they never change. */
export const tutorChoice = (g: HQ) => (g.req!.opts.length <= 1 ? 0 : habit(g, 'normal', Math.random, true))

function habit(g: HQ, level: 'easy' | 'normal', rnd: () => number, classic = false): number {
  const req = g.req!
  const p = req.p
  const o = (1 - p) as Side
  const P = g.P(p)
  const opts = req.opts
  const find = (t: string) => opts.findIndex((x) => x.t === t)
  const off = g.s.off[o] ?? 0
  const sloppy = level === 'easy' ? () => rnd() * 2 : () => 0
  const W = classic ? CLASSIC : seatWeights[p] ?? WEIGHTS

  if (req.kind === 'mulligan') {
    const chars = P.hand.filter((u) => g.isChar(u)).length
    return find(chars >= W.mullChars || level === 'easy' ? 'keep' : 'pick')
  }

  if (req.kind === 'start') {
    const chars = P.hand.filter((u) => g.isChar(u))
    const bestRc = Math.max(-1, ...chars.map((u) => g.def(u).rc ?? -1))
    const plan = blockPlan(g, p, off)
    const canBlock = find('block') >= 0 && plan.sum >= off
    if (level === 'easy' || classic) {
      const setters = chars.filter((u) => (g.def(u).st ?? -1) >= 0).length
      const attackers = chars.filter((u) => g.def(u).at != null).length
      const canReceive = bestRc + 1 >= off && chars.length >= 3 && setters >= 1 && attackers >= 2
      if (canReceive && (off > 0 || !canBlock || level === 'easy')) return find('receive')
      if (canBlock) return find('block')
      if (find('block') >= 0 && plan.sum > bestRc) return find('block')
      return find('receive')
    }
    // Can the hand as it stands make a whole receive, set and attack out of three different characters?
    const rally = fullRally(g, chars, off)
    // Block when the hand cannot carry a rally, and whenever one blocker is enough: it costs one card
    // where a receive, set and attack cost three.
    if (canBlock && (!rally || plan.picks.length <= W.blockCards)) return find('block')
    if (rally || bestRc >= off) return find('receive')
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
      return best(opts, (x) => (x.t === 'enter' ? (g.def(x.uid!).bl ?? 0) * W.blW - value(x.uid!) * W.blWorth + sloppy() : -99))
    }
    if (area === 'serve') return best(opts, (x) => (x.t === 'enter' ? (g.def(x.uid!).sv ?? 0) * W.svW - Math.max(g.def(x.uid!).rc ?? 0, g.def(x.uid!).at ?? 0) * W.svKeep + sloppy() : -99))
    if (area === 'receive') {
      // The cheapest card that still makes the receive, keeping a setter and an attacker in hand.
      return best(opts, (x) => {
        if (x.t !== 'enter') return -99
        const d = g.def(x.uid!)
        const rest = P.hand.filter((u) => u !== x.uid && g.isChar(u))
        const keeps = rest.some((u) => g.def(u).st != null) && rest.some((u) => g.def(u).at != null) ? W.rcKeeps : 0
        const rc = d.rc ?? 0
        const makes = rc >= off ? 20 - (rc - off) * W.rcOver : rc - off
        return makes + keeps - (d.at ?? 0) * W.rcAt + sloppy()
      })
    }
    if (area === 'set') return best(opts, (x) => {
      if (x.t !== 'enter') return -99
      const rest = P.hand.filter((u) => u !== x.uid && g.isChar(u) && g.def(u).at != null && g.def(u).name !== g.def(x.uid!).name)
      return (g.def(x.uid!).st ?? 0) * W.stW + (rest.length ? W.stHasAtk : -W.stNoAtk) - (g.def(x.uid!).at ?? 0) * W.stAt + sloppy()
    })
    return best(opts, (x) => (x.t === 'enter' ? (g.def(x.uid!).at ?? 0) * W.atW + (g.sc(x.uid!).enter ? W.atEnter : 0) + sloppy() : -99))
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
    if (short <= 0 && P.hand.length <= W.freeKeep && phase !== 'draw') return find('done')
    return best(opts, (x) => (x.t === 'event' ? 3 : x.t === 'hand' ? (short > 0 ? 2 : -1) : x.t === 'done' ? 0 : -9))
  }

  if (req.kind === 'name') return 0
  return best(opts, (x) => (x.w ?? 0) + sloppy() * 0.2)
}
