// The CPU opponent. It plays by the same rules as a person and only looks at what a
// person in its seat could see: its own hand and the cards that are face up.
import { DEFS, Match, type Opt, type Side } from './engine'
import { EFFORT, LEVELS, dealLeaning, searchChoice, shuffleSlots, type Effort, type Level, type SearchGame } from './search'

export { EFFORT, LEVELS, type Level }

const best = (opts: Opt[], score: (o: Opt, i: number) => number) => {
  let at = 0
  let top = -Infinity
  opts.forEach((o, i) => { const v = score(o, i); if (v > top) { top = v; at = i } })
  return at
}

/**
 * The numbers behind the Normal player's rules of thumb. They were first set by feel and are now tuned
 * by self-play in the bot lab (tools/bot-lab/tune.ts). Whole numbers are counts; the rest are weights.
 */
export const WEIGHTS = {
  mullEarly: 2, mullCost: 3,
  chargeTo: 6, chargeMax: 9, chargeHand: 3, opensColor: 3,
  keepWaza: 2.4, wazaGlut: 2, twinWaza: 0.3, soonNow: 2, soonNext: 4, soonLate: 2, keepPower: 0.5, twin: 0.5,
  body: 2, power: 2, downed: 3.5, cover: 0.1, worthIt: 0.55, reserve: 2, reserveBodies: 4,
  // Reading the other side of the board, and what the card itself does (see `read` below).
  openFirst: 0, openSure: 0, beats: 0, loses: 0, flips: 0, dd: 0, etbDraw: 0, winDraw: 0, engineSave: 0,
  // How the deck's own make-up bends the numbers above (see `planFor` below).
  big_body: 0, big_power: 0, big_worthIt: 0, big_reserve: 0, big_chargeTo: 0, big_soonLate: 0, big_keepWaza: 0, big_cover: 0,
  waza_body: 0, waza_power: 0, waza_worthIt: 0, waza_reserve: 0, waza_chargeTo: 0, waza_soonLate: 0, waza_keepWaza: 0, waza_cover: 0,
  draw_body: 0, draw_power: 0, draw_worthIt: 0, draw_reserve: 0, draw_chargeTo: 0, draw_soonLate: 0, draw_keepWaza: 0, draw_cover: 0,
}
export type Weights = typeof WEIGHTS
/** The first values, kept for the tutorial's suggested moves so the lesson never changes. */
const CLASSIC: Weights = { ...(Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0])) as Weights), mullEarly: 2, mullCost: 3, chargeTo: 6, chargeMax: 9, chargeHand: 3, opensColor: 3, keepWaza: 3.2, wazaGlut: 1, twinWaza: 0.3, soonNow: 6, soonNext: 4, soonLate: 2, keepPower: 0.5, twin: 0.5, body: 4, power: 1, downed: 3.5, cover: 0.2, worthIt: 0.55, reserve: 1, reserveBodies: 2, openFirst: 0, openSure: 0, beats: 0, loses: 0, flips: 0, dd: 0, etbDraw: 0, winDraw: 0, engineSave: 0 }
/** Lets the bot lab give each seat its own numbers when it tests one set against another. */
export const seatWeights: [Weights | null, Weights | null] = [null, null]

/**
 * Game plans. Every deck wants something different: one goes big, one goes wide, one leans on Waza.
 * The bot reads its own deck list for three things and bends the numbers above to suit:
 *   big   how expensive its Horobeat are on average
 *   waza  how many Waza it runs
 *   draw  how many of its cards draw cards
 * Each is measured against a typical deck (0 means typical, about +1 or -1 at the extremes). A number
 * named like `big_power` says how much `power` grows (or shrinks) per point of `big`. They start at 0,
 * which means "one playbook for everyone", and are tuned by self-play in the bot lab.
 */
const TRAITS = ['big', 'waza', 'draw'] as const
const BENDS = ['body', 'power', 'worthIt', 'reserve', 'chargeTo', 'soonLate', 'keepWaza', 'cover'] as const
export function deckTraits(ids: string[]): Record<(typeof TRAITS)[number], number> {
  const cards = ids.map((id) => DEFS.get(id)).filter((d): d is NonNullable<typeof d> => !!d)
  const bodies = cards.filter((d) => d.type === 'Horobeat')
  const avg = bodies.length ? bodies.reduce((a, d) => a + d.cost, 0) / bodies.length : 4.2
  const clamp = (v: number) => Math.max(-2, Math.min(2, v))
  return {
    big: clamp((avg - 4.2) / 0.8),
    waza: clamp((cards.length - bodies.length - 9) / 4),
    draw: clamp((cards.filter((d) => /draw \d/i.test(d.effect || '')).length - 6.5) / 5),
  }
}
const bent = new WeakMap<object, Map<string, Weights>>()
/** The numbers this seat plays by: the given set, bent to suit the deck in that seat. */
function planFor(m: Match, p: Side, W: Weights) {
  let byDeck = bent.get(W)
  if (!byDeck) bent.set(W, (byDeck = new Map()))
  const ids = m.setup.decks[p]
  const key = ids.join(',')
  let out = byDeck.get(key)
  if (!out) {
    const t = deckTraits(ids)
    const w = { ...W } as Record<string, number>
    for (const k of BENDS) {
      let f = 1
      for (const tr of TRAITS) f += (w[`${tr}_${k}`] || 0) * t[tr]
      w[k] = Number.isInteger(W[k]) ? Math.max(0, Math.round(W[k] * f)) : +(W[k] * Math.max(0, f)).toFixed(4)
    }
    out = w as Weights
    byDeck.set(key, out)
  }
  return out
}

/** What a card's text says it does, as far as the habits care. Read once per card. */
const traits = new Map<string, { dd: boolean; etbDraw: number; winDraw: number }>()
function read(m: Match, uid: number) {
  const d = m.def(uid)
  let t = traits.get(d.id)
  if (!t) {
    const e = d.effect || ''
    t = { dd: /Double Damage/i.test(e), etbDraw: +(/enters play, draw (\d)/i.exec(e)?.[1] ?? 0), winDraw: +(/wins a battle[^●]*?draw (\d)/i.exec(e)?.[1] ?? 0) }
    traits.set(d.id, t)
  }
  return t
}

/** How much the CPU wants to hold on to a card in its hand. */
function keepValue(m: Match, p: Side, uid: number, W: Weights) {
  const P = m.P(p)
  const d = m.def(uid)
  const ena = P.ena.length
  const twins = P.hand.filter((u) => m.name(u) === d.name).length - 1
  if (d.type === 'Waza') return W.keepWaza - (P.hand.filter((u) => m.def(u).type === 'Waza').length > 2 ? W.wazaGlut : 0) - twins * W.twinWaza
  const soon = d.cost <= ena + 1 ? W.soonNow : d.cost <= ena + 3 ? W.soonNext : W.soonLate
  return soon + (d.power / 10000) * W.keepPower - twins * W.twin
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

/** Ending the Summon Phase with no Horobeat of its own on the board when one could have been played to a line. */
function passesWithEmptyBoard(m: Match, x: Opt) {
  const req = m.req!
  if (req.kind !== 'main' || x.t !== 'end') return false
  return m.countH(req.p) === 0 && req.opts.some((y) => y.t === 'play' && y.via === 'new')
}

/** What each Boost or Waza on offer would add to the line right now, and what it costs. */
function powerPlays(m: Match, p: Side, line: number, opts: Opt[]) {
  const o = (1 - p) as Side
  const zone = m.P(p).waza[line]
  const mine = m.power(p, line)
  const theirs = m.power(o, line)
  return opts.map((x, i) => {
    if ((x.t !== 'waza' && x.t !== 'boost') || x.uid == null) return null
    zone.push({ uid: x.uid, boost: x.t === 'boost' })
    const gain = m.power(p, line) - mine - (m.power(o, line) - theirs)
    zone.pop()
    return { i, gain, cost: x.t === 'boost' ? 1 : m.def(x.uid).cost }
  }).filter((x): x is { i: number; gain: number; cost: number } => !!x && x.gain > 0)
}

/**
 * Adding power to a line that stays lost: even everything affordable would not catch up. Waza that do
 * something besides add power are left to judgement.
 */
function hopelessPower(m: Match, x: Opt) {
  const req = m.req!
  if (req.kind !== 'battle' || (x.t !== 'waza' && x.t !== 'boost') || x.uid == null) return false
  const p = req.p
  const o = (1 - p) as Side
  const line = m.s.line
  if (m.top(o, line) == null || m.power(p, line) >= m.power(o, line)) return false
  const top = m.top(p, line)
  if (x.t === 'boost') {
    if (top != null && m.sc(top).onBoostUsed) return false
  } else {
    const sc = m.rawScript(x.uid)
    if (sc.wazaOnUse || sc.wazaOnWin || (top != null && m.sc(top).onWazaUsed)) return false
  }
  let budget = m.unused(p)
  let total = 0
  for (const y of powerPlays(m, p, line, req.opts).sort((a, b) => b.gain / b.cost - a.gain / a.cost)) if (y.cost <= budget) { budget -= y.cost; total += y.gain }
  return m.power(p, line) + total < m.power(o, line)
}

/**
 * What the computer has been taught. Each entry is a mistake a player spotted, written as a test on
 * one choice. Normal avoids them by habit. Hard and Expert never consider a `forbid` one (it can never
 * be right); the others are usually wrong, so they are weighed and chosen only when clearly better. The bot lab
 * (tools/bot-lab) counts how often each one happens and keeps saved positions to check against.
 */
export const MISTAKES: { id: string; taught: string; what: string; forbid: boolean; is: (m: Match, x: Opt) => boolean }[] = [
  { id: 'cover-fresh', taught: '2026-11-22', what: 'Plays a Horobeat and covers it in the same turn with nothing gained from the stack', forbid: true, is: coversFresh },
  { id: 'cover-on-free-play', taught: '2026-11-22', what: 'On a trigger or free play, covers a standing Horobeat when an empty line was open and the line was not being lost', forbid: false, is: coversOnFreePlay },
  { id: 'needless-power', taught: '2026-11-22', what: 'Uses a Boost or a power-only Waza on a line it is already winning, or with no one across', forbid: true, is: needless },
  { id: 'pass-with-empty-board', taught: '2026-11-22', what: 'Ends its Summon Phase with no Horobeat on the board when it could have played one', forbid: false, is: passesWithEmptyBoard },
  { id: 'hopeless-power', taught: '2026-11-22', what: 'Uses a Boost or a power-only Waza on a line that stays lost even with everything it can afford', forbid: true, is: hopelessPower },
]

/** One play in a planned Summon Phase. A plan is a list of these, and always finishes by ending the phase. */
type Step = { uid: number; via: Opt['via']; line?: number }
const MAX_PLANS = 5
const MAX_NODES = 40

/**
 * Every sensible way to spend this Summon Phase with the cards in hand right now, as whole plans.
 * The first plan is always what the Normal habits would do. Plans that end with the same board,
 * hand and Ena are the same plan (the order the cards went down in does not matter).
 */
function turnPlans(real: Match, rnd: () => number): Step[][] {
  const me = real.req!.p
  const stamp = real.turnStamp()
  const inHand = new Set(real.P(me).hand)
  const at = (path: number[]) => Match.replay(real.setup, [...real.answers, ...path])
  const mine = (m: Match) => !!m.req && m.req.p === me && m.turnStamp() === stamp
  // Answer the small questions a play raises (targets, "use this effect?") the way the habits would.
  const settle = (m: Match, path: number[]) => {
    for (let n = 0; n < 12 && m.req && m.req.kind !== 'main' && m.turnStamp() === stamp && m.s.phase === real.s.phase; n++) {
      const c = m.req.opts.length <= 1 ? 0 : habit(m, 'normal', rnd)
      path.push(c)
      m.answer(c)
    }
    return mine(m) && m.req!.kind === 'main'
  }
  const sign = (m: Match) => {
    const P = m.P(me)
    return P.lines.map((st) => (st ? st.cards.map((u) => m.s.cards[u]).join('+') + (st.down ? 'd' : '') : '-')).sort().join('|') + '#' + [...P.hand].map((u) => m.s.cards[u]).sort().join(',') + '#' + m.unused(me)
  }
  const plans: Step[][] = []
  const seen = new Set<string>()
  // What the habits would do, first.
  {
    const m = at([])
    const steps: Step[] = []
    for (let n = 0; n < 8 && mine(m) && m.req!.kind === 'main'; n++) {
      const c = habit(m, 'normal', rnd)
      const o = m.req!.opts[c]
      if (o.t !== 'play') break
      steps.push({ uid: o.uid!, via: o.via, line: o.line })
      m.answer(c)
      if (!settle(m, [])) break
    }
    plans.push(steps)
  }
  let nodes = 0
  const walk = (path: number[], steps: Step[]) => {
    if (plans.length >= MAX_PLANS || nodes++ > MAX_NODES) return
    const m = at(path)
    if (!(mine(m) && m.req!.kind === 'main')) return
    const key = sign(m)
    if (seen.has(key)) return
    seen.add(key)
    // Stopping here is a plan of its own.
    const same = (a: Step[], b: Step[]) => a.length === b.length && a.every((x, i) => x.uid === b[i].uid && x.via === b[i].via && x.line === b[i].line)
    if (!plans.some((pl) => same(pl, steps))) plans.push(steps)
    m.req!.opts.forEach((o, i) => {
      if (o.t !== 'play' || o.uid == null || !inHand.has(o.uid)) return
      if (MISTAKES.some((k) => k.forbid && k.is(m, o))) return
      const next = [...path, i]
      const child = at(next)
      if (!settle(child, next)) return
      walk(next, [...steps, { uid: o.uid, via: o.via, line: o.line }])
    })
  }
  walk([], [])
  return plans
}

/** Carry a plan out on a copy of the match (whose hidden cards may have been reshuffled), then end the phase. */
function followPlan(m: Match, me: Side, stamp: number, steps: Step[], rnd: () => number) {
  const here = () => !!m.req && m.req.p === me && m.turnStamp() === stamp
  const settle = () => { for (let n = 0; n < 12 && here() && m.req!.kind !== 'main'; n++) m.answer(m.req!.opts.length <= 1 ? 0 : habit(m, 'normal', rnd)) }
  for (const st of steps) {
    settle()
    if (!here() || m.req!.kind !== 'main') return
    const i = m.req!.opts.findIndex((o) => o.t === 'play' && o.uid === st.uid && o.via === st.via && o.line === st.line)
    if (i < 0) return
    m.answer(i)
  }
  settle()
  if (here() && m.req!.kind === 'main') {
    const end = m.req!.opts.findIndex((o) => o.t === 'end')
    if (end >= 0) m.answer(end)
  }
}

/** Hard and Expert in the Summon Phase: weigh whole turns against each other, then make the first play of the best one. */
function planTurn(real: Match, e: Effort, rnd: () => number): number | null {
  const me = real.req!.p
  const stamp = real.turnStamp()
  const plans = turnPlans(real, rnd)
  if (plans.length < 2) return null
  const base = searchGame(real, !e.lean)
  const first = (i: number) => (plans[i].length ? real.req!.opts.findIndex((o) => o.t === 'play' && o.uid === plans[i][0].uid && o.via === plans[i][0].via && o.line === plans[i][0].line) : real.req!.opts.findIndex((o) => o.t === 'end'))
  const fresh = new WeakSet<Match>()
  const game: SearchGame<Match> = {
    ...base,
    copy: () => { const m = base.copy(); fresh.add(m); return m },
    // The first answer on a copy is "follow this plan"; after that the match is played out as usual.
    answer: (m, i) => { if (fresh.has(m)) { fresh.delete(m); followPlan(m, me, stamp, plans[i], rnd) } else m.answer(i) },
    skip: undefined,
    doubt: (i) => { const o = real.req!.opts[first(i)]; return !!o && MISTAKES.some((k) => !k.forbid && k.is(real, o)) },
  }
  const pick = searchChoice(game, plans.length, 0, e, rnd)
  const choice = first(pick)
  return choice >= 0 ? choice : null
}

export function cpuChoice(m: Match, level: Level, rnd: () => number = Math.random, effort?: Effort): number {
  const count = m.req!.opts.length
  if (count <= 1) return 0
  // Beginner plays like Easy, but about a third of the time it just does something legal.
  if (level === 'beginner') return rnd() < 0.35 ? Math.floor(rnd() * count) : habit(m, 'easy', rnd)
  if (level === 'easy' || level === 'normal') return habit(m, level, rnd)
  const e = effort ?? EFFORT[level]!
  if (m.req!.kind === 'main' && e.plan) {
    const planned = planTurn(m, e, rnd)
    if (planned != null) return planned
  }
  return searchChoice(searchGame(m, !e.lean), count, habit(m, 'normal', rnd), e, rnd)
}

/** Everything the player to move cannot see is reshuffled: the other hand, both decks and the Hearts. */
/** How a card is sorted when guessing what the other player holds. */
export function handClass(m: Match, uid: number, unused: number, ena = 99) {
  const d = m.def(uid)
  if (d.type === 'Waza') return d.cost <= unused ? 'wazaReady' : 'wazaLater'
  // A Horobeat that costs more than the player's whole Ena Zone cannot have been played yet.
  if (d.cost > ena) return 'bodyTooBig'
  if (d.boost > 0) return 'boost'
  return d.cost <= unused ? 'bodyReady' : 'bodyLater'
}
/**
 * How much likelier than chance each kind of card is to be in a player's hand, by how much Ena they
 * have left unused. Measured from the lab's own games (tools/bot-lab/read-stats.ts), not guessed.
 * 1 means no lean. Rows: 0, 1, or 2 and more unused Ena.
 */
export const HAND_LEAN: Record<string, number>[] = [
  { bodyTooBig: 1.19, wazaLater: 1.35, boost: 0.71, bodyLater: 0.72 },
  { bodyTooBig: 1.2, wazaLater: 1.49, wazaReady: 1.36, boost: 0.67, bodyLater: 0.68 },
  { bodyTooBig: 1.3, wazaLater: 1.42, wazaReady: 1.45, boost: 0.69, bodyLater: 0.88, bodyReady: 0.61 },
]

export function searchGame(real: Match, flat = true): SearchGame<Match> {
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
        P.hearts.forEach((h) => { if (!shown.has(h.uid)) slots.push({ get: () => h.uid, set: (v) => { h.uid = v } }) })
        if (side === me) { shuffleSlots(slots, rnd); continue }
        const rest = slots.splice(0)
        list(P.hand)
        if (flat) { shuffleSlots([...slots, ...rest], rnd); continue }
        const unused = m.unused(side)
        const lean = HAND_LEAN[Math.min(2, unused)]
        const ena = P.ena.length
        dealLeaning(slots, rest, (u) => lean[handClass(m, u, unused, ena)] ?? 1, rnd)
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
  // Easy (and Beginner, which plays like Easy) keeps the first numbers: it is meant to be beatable, and the tutorials' opponent must never change.
  const W = classic || level === 'easy' ? CLASSIC : planFor(m, p, seatWeights[p] ?? WEIGHTS)

  if (req.kind === 'mulligan') {
    if (level === 'easy') return find('keep')
    const early = P.hand.filter((u) => m.def(u).type === 'Horobeat' && m.def(u).cost <= W.mullCost).length
    return find(early >= W.mullEarly ? 'keep' : 'mulligan')
  }

  if (req.kind === 'charge') {
    const ena = P.ena.length
    const wantsMore = ena < W.chargeTo || (ena < W.chargeMax && P.hand.length >= W.chargeHand && P.hand.some((u) => m.def(u).cost > ena))
    if (!wantsMore) return find('skip')
    // A color the hand needs but the Ena Zone lacks is worth charging first.
    const have = new Set(P.ena.map((e) => m.def(e.uid).color))
    return best(opts, (x) => {
      if (x.t !== 'charge') return -100
      const d = m.def(x.uid!)
      const opensColor = !have.has(d.color) && P.hand.some((u) => u !== x.uid && m.def(u).color === d.color)
      return -keepValue(m, p, x.uid!, W) + (opensColor ? W.opensColor : 0)
    })
  }

  if (req.kind === 'main') {
    const free = m.unused(p)
    const hasTrick = P.hand.some((u) => m.def(u).type === 'Waza' || m.def(u).boost > 0)
    const behind = m.countH(p) < m.countH(o)
    const careful = level === 'normal' && !classic
    // A Horobeat already on the board that draws cards when it wins makes saving Ena for the Ena Draw matter less.
    let engine = 0
    if (careful) for (let l = 0; l < 5; l++) { const t = m.top(p, l); if (t != null && !m.isDown(p, l)) engine += read(m, t).winDraw }
    const reserve = level === 'normal' && hasTrick && m.s.round >= 2 && !behind && m.countH(p) >= W.reserveBodies ? Math.max(0, W.reserve - (engine >= 2 ? W.engineSave : 0)) : 0
    // The other side has finished summoning this round when this player is not the First Player.
    const sure = m.s.first !== p
    /** What the matchup on this line is worth with `mine` power there instead of `was`. */
    const matchup = (x: Opt, mine: number, was: number | null) => {
      const r = read(m, x.uid!)
      let v = r.dd ? W.dd : 0
      v += r.etbDraw * W.etbDraw
      const across = m.top(o, x.line!)
      if (across == null) return v + (was == null ? (sure ? W.openSure : W.openFirst) : 0) + r.winDraw * W.winDraw
      const theirs = m.power(o, x.line!)
      if (mine > theirs) v += (was == null ? W.beats : was <= theirs ? W.flips : 0) + r.winDraw * W.winDraw
      else if (mine < theirs) v -= W.loses
      return v
    }
    let pick = find('end')
    let top = W.worthIt
    opts.forEach((x, i) => {
      if (x.t !== 'play') return
      const d = m.def(x.uid!)
      let value: number
      let paid: number
      if (x.via === 'new') {
        paid = d.cost
        value = W.body + (d.power / 1500) * W.power
        if (careful) value += matchup(x, d.power, null)
      } else {
        const base = m.top(p, x.line!)!
        paid = Math.max(0, d.cost - m.costInLine(base))
        value = ((d.power - m.def(base).power) / 1500) * W.power + (m.isDown(p, x.line!) ? W.downed : 0) + W.cover
        // Do not cover a Horobeat that came down this very turn unless something gains from the stack.
        if (careful && wasteful(m, x)) return
        if (careful) { const was = m.power(p, x.line!); value += matchup(x, was + d.power - m.def(base).power, was) }
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
            return (((b.power - a.power) / 1500) * W.power + W.cover) / (b.cost - a.cost + 1) > W.worthIt
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
    const plays = powerPlays(m, p, line, opts)
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
