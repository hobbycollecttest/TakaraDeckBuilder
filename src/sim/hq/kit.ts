// Building blocks for Haikyu card skills. Each card's text is put together from these,
// clause by clause, in scripts.ts.
import type { Area, Ctx, Def, Gen, HQ, HQScript, Param, Phase, Side, Watch } from './engine.js'
import { SkipBlock, SkipToEnd } from './flow.js'

export type Eff = (g: HQ, c: Ctx) => Gen<boolean | void>
export type Cond = (g: HQ, c: Ctx) => boolean
export type CP = (g: HQ, uid: number) => boolean
export type Cost = { can: (g: HQ, c: Ctx) => boolean; pay: (g: HQ, c: Ctx) => Gen<boolean>; text: string; dear?: boolean }

const opp = (p: Side) => (1 - p) as Side
const src = (g: HQ, c: Ctx) => g.def(c.uid).name
const PN: Record<Param, string> = { sv: 'Serve', bl: 'Block', rc: 'Receive', st: 'Set', at: 'Attack' }

// ---------- card tests ----------
export const T = (...teams: string[]): CP => (g, u) => teams.some((t) => g.has(u, t))
export const N = (...names: string[]): CP => (g, u) => names.includes(g.name(u)) || names.includes(g.def(u).name)
export const POS = (...pos: string[]): CP => (g, u) => pos.some((x) => g.isPos(u, x))
export const Y = (...years: string[]): CP => (g, u) => years.some((y) => g.def(u).years.includes(y))
export const CHAR: CP = (g, u) => g.def(u).type === 'Character'
export const EVENT: CP = (g, u) => g.def(u).type === 'Event'
export const NOSKILL: CP = (g, u) => g.noSkill(u)
export const ANY: CP = () => true
export const and = (...ps: CP[]): CP => (g, u) => ps.every((f) => f(g, u))
export const not = (f: CP): CP => (g, u) => !f(g, u)
export const orig = (k: Param, test: (n: number) => boolean): CP => (g, u) => g.def(u)[k] != null && test(g.def(u)[k]!)
export const playableAs = (...ph: Phase[]): CP => (g, u) => g.def(u).type === 'Event' && g.timings(u).some((x) => ph.includes(x))

// ---------- conditions ----------
export const allTeam = (...teams: string[]): Cond => (g, c) => teams.some((t) => g.allTeam(c.p, t))
export const handLE = (n: number): Cond => (g, c) => g.P(c.p).hand.length <= n
export const handGE = (n: number): Cond => (g, c) => g.P(c.p).hand.length >= n
export const oppHandLE = (n: number): Cond => (g, c) => g.P(opp(c.p)).hand.length <= n
export const oppHandGE = (n: number): Cond => (g, c) => g.P(opp(c.p)).hand.length >= n
export const oppOffGE = (n: number, kind?: string): Cond => (g, c) => (g.s.off[opp(c.p)] ?? 0) >= n && (!kind || g.s.offKind[opp(c.p)] === kind)
export const oppOffLE = (n: number, ...kinds: string[]): Cond => (g, c) => g.s.off[opp(c.p)] != null && (g.s.off[opp(c.p)] ?? 0) <= n && (!kinds.length || kinds.includes(g.s.offKind[opp(c.p)]))
export const at = (area: Area, test: CP): Cond => (g, c) => { const t = g.top(c.p, area); return t != null && test(g, t) }
export const setIs = (...names: string[]): Cond => at('set', N(...names))
export const attackIs = (...names: string[]): Cond => at('attack', N(...names))
export const receiveIs = (...names: string[]): Cond => at('receive', N(...names))
export const serveIs = (...names: string[]): Cond => at('serve', N(...names))
export const oppAt = (area: Area, test: CP): Cond => (g, c) => { const t = g.top(opp(c.p), area); return t != null && test(g, t) }
export const onCourt = (test: CP): Cond => (g, c) => g.chars(c.p).some((x) => test(g, x.uid))
export const inBlock = (test: CP, n = 1): Cond => (g, c) => g.blockers(c.p).filter((x) => test(g, x.uid)).length >= n
export const eventGE = (n: number, test: CP = ANY): Cond => (g, c) => g.P(c.p).event.filter((u) => test(g, u)).length >= n
export const eventLE = (n: number): Cond => (g, c) => g.P(c.p).event.length <= n
export const oppEventGE = (n: number, test: CP = ANY): Cond => (g, c) => g.P(opp(c.p)).event.filter((u) => test(g, u)).length >= n
export const scoreTotalLE = (n: number): Cond => (g) => g.P(0).score.length + g.P(1).score.length <= n
export const dropNames = (n: number, test: CP): Cond => (g, c) => new Set(g.P(c.p).drop.filter((u) => test(g, u)).map((u) => g.def(u).name)).size >= n
export const fromHand: Cond = (g, c) => g.s.entry[c.uid]?.from === 'hand'
export const enteredBy = (name?: string): Cond => (g, c) => { const b = g.s.entry[c.uid]?.by; return name ? b === name : !!b }
export const onTopOf = (test: CP): Cond => (g, c) => { const u = g.s.entry[c.uid]?.onTop; return u != null && test(g, u) }
export const asSide: Cond = (g, c) => !!g.s.entry[c.uid]?.asSide
export const paidAll = (test: CP): Cond => (g, c) => c.paid.length > 0 && c.paid.every((u) => test(g, u))
export const paidAny = (test: CP): Cond => (g, c) => c.paid.some((u) => test(g, u))
export const phaseIs = (...ph: Phase[]): Cond => (g) => ph.includes(g.s.phase)
export const all = (...cs: Cond[]): Cond => (g, c) => cs.every((f) => f(g, c))
export const either = (...cs: Cond[]): Cond => (g, c) => cs.some((f) => f(g, c))
export const targetIs = (test: CP): Cond => (g, c) => c.target != null && test(g, c.target)
export const targetGE = (k: Param, n: number): Cond => (g, c) => c.target != null && (g.param(c.target, k) ?? -99) >= n
export const selfGE = (k: Param, n: number): Cond => (g, c) => (g.param(c.uid, k) ?? -99) >= n
export const seenCount = (test: CP, n: number): Cond => (g, c) => c.seen.filter((u) => test(g, u)).length >= n
export const seenAll = (test: CP): Cond => (g, c) => c.seen.length > 0 && c.seen.every((u) => test(g, u))
export const oppCourt = (test: CP): Cond => (g, c) => g.chars(opp(c.p)).some((x) => test(g, x.uid))
export const difTeams = (n: number): Cond => (g, c) => new Set(g.chars(c.p).flatMap((x) => g.def(x.uid).schools)).size >= n
export const fewerScore: Cond = (g, c) => g.P(c.p).score.length < g.P(opp(c.p)).score.length

// ---------- costs ----------
export const guts = (n: number, areas?: Area[], test?: CP): Cost => ({
  text: `Pay ${n} Guts${areas ? ` from your ${areas.map((a) => a[0].toUpperCase() + a.slice(1)).join(' and ')} Area` : ''}.`,
  can: (g, c) => g.payable(c.p, areas, test && ((u) => test(g, u))).length >= n,
  *pay(g, c) {
    c.paid = yield* g.payGuts(c.p, n, areas, test && ((u) => test(g, u)))
    return c.paid.length === n
  },
})
/** "Pay 2 Guts each from your Receive Area, Set Area and Attack Area." */
export const gutsEach = (n: number, areas: Area[]): Cost => ({
  text: `Pay ${n} Guts from each of ${areas.length} Areas.`,
  can: (g, c) => areas.every((a) => g.guts(c.p, a).length >= n),
  *pay(g, c) {
    c.paid = []
    for (const a of areas) c.paid.push(...(yield* g.payGuts(c.p, n, [a])))
    return c.paid.length === n * areas.length
  },
})
export const discard = (n: number, test: CP = ANY): Cost => ({
  text: `Discard ${n} card${n > 1 ? 's' : ''}.`,
  dear: true,
  can: (g, c) => g.P(c.p).hand.filter((u) => u !== c.uid && test(g, u)).length >= n,
  *pay(g, c) {
    const out = yield* g.chooseDiscard(c.p, n, (u) => u !== c.uid && test(g, u))
    c.paid = out
    return out.length === n
  },
})
export const toEvent = (test: CP = EVENT): Cost => ({
  text: 'Send a card from your hand to your Event Area.',
  dear: true,
  can: (g, c) => g.P(c.p).hand.some((u) => u !== c.uid && test(g, u)),
  *pay(g, c) {
    const uid = yield* g.pickCard(c.p, 'Choose a card to send to your Event Area.', g.P(c.p).hand.filter((u) => u !== c.uid && test(g, u)), false, (u) => 10 - g.worth(u))
    if (uid == null) return false
    g.lift(uid)
    g.P(c.p).event.push(uid)
    g.say(`${g.nm(c.p)} sends ${g.def(uid).name} to the Event Area.`, { t: 'event', p: c.p, uid })
    c.paid = [uid]
    return true
  },
})
export const eventToDrop = (n: number, test: CP = ANY, upTo = false): Cost => ({
  text: `Send ${n} card${n > 1 ? 's' : ''} from your Event Area to the Drop Area.`,
  can: (g, c) => g.P(c.p).event.filter((u) => test(g, u)).length >= (upTo ? 1 : n),
  *pay(g, c) {
    c.paid = []
    for (let i = 0; i < n; i++) {
      const pool = g.P(c.p).event.filter((u) => test(g, u))
      const uid = yield* g.pickCard(c.p, 'Choose a card from your Event Area to send to the Drop Area.', pool, upTo && i > 0, () => 1)
      if (uid == null) break
      g.toDrop(uid)
      c.paid.push(uid)
    }
    return upTo ? c.paid.length > 0 : c.paid.length === n
  },
})
export const mill = (n: number, upTo = false): Cost => ({
  text: `Send ${upTo ? 'up to ' : ''}${n} card${n > 1 ? 's' : ''} from the top of your deck to the Drop Area.`,
  can: (g, c) => g.P(c.p).deck.length >= (upTo ? 1 : n),
  *pay(g, c) {
    const P = g.P(c.p)
    const cut = P.deck.splice(Math.max(0, P.deck.length - n)).reverse()
    P.drop.push(...cut)
    c.seen = cut
    g.say(`${g.nm(c.p)} sends ${cut.map((u) => g.def(u).name).join(', ')} from the top of the deck to the Drop Area.`, { t: 'mill', p: c.p, n: cut.length })
    return upTo || cut.length === n
  },
})
export const selfToDrop: Cost = {
  text: 'Send this card to the Drop Area.',
  can: () => true,
  *pay(g, c) { g.toDrop(c.uid); return true },
}
export const handToBottom = (n = 1): Cost => ({
  text: `Put ${n} card from your hand on the bottom of your deck.`,
  dear: true,
  can: (g, c) => g.P(c.p).hand.filter((u) => u !== c.uid).length >= n,
  *pay(g, c) {
    for (let i = 0; i < n; i++) {
      const uid = yield* g.pickCard(c.p, 'Choose a card to put on the bottom of your deck.', g.P(c.p).hand.filter((u) => u !== c.uid), false, (u) => 10 - g.worth(u))
      if (uid == null) return false
      g.lift(uid)
      g.P(c.p).deck.unshift(uid)
      g.say(`${g.nm(c.p)} puts a card on the bottom of the deck.`)
    }
    return true
  },
})
/** A cost with nothing to give up, such as saying a line out loud. */
export const free = (text = ''): Cost => ({ text, can: () => true, *pay() { return true } })
export const both = (...cs: Cost[]): Cost => ({
  text: cs.map((x) => x.text).join(' '),
  dear: cs.some((x) => x.dear),
  can: (g, c) => cs.every((x) => x.can(g, c)),
  *pay(g, c) {
    const paid: number[] = []
    for (const x of cs) {
      if (!(yield* x.pay(g, c))) return false
      paid.push(...c.paid)
    }
    c.paid = paid
    return true
  },
})

// ---------- putting a skill together ----------
export function seq(...effs: Eff[]): Eff {
  return function* (g, c) {
    for (const e of effs) yield* e(g, c)
    return true
  }
}
/** "If X, Y." */
export function when(cond: Cond, ...effs: Eff[]): Eff {
  return function* (g, c) {
    if (!cond(g, c)) return false
    for (const e of effs) yield* e(g, c)
    return true
  }
}
/** "X. If you do, Y." */
export function ifDid(first: Eff, ...then: Eff[]): Eff {
  return function* (g, c) {
    if ((yield* first(g, c)) === false) return false
    for (const e of then) yield* e(g, c)
    return true
  }
}
/** "You may [cost] to use this skill. [effects]" */
export function may(cost: Cost, ...effs: Eff[]): Eff {
  return function* (g, c) {
    if (!cost.can(g, c)) return false
    const keen = cost.dear ? (g.P(c.p).hand.length >= 4 ? 1 : -1) : 1
    const yes = yield* g.yesNo(c.p, `Use the skill of ${g.def(c.uid).name}? ${cost.text}`, keen, [c.uid])
    if (!yes) return false
    if (!(yield* cost.pay(g, c))) return false
    for (const e of effs) yield* e(g, c)
    return true
  }
}
/** "Choose one of the following." Options whose condition fails are not offered. */
export function choose(...options: [string, Eff, Cond?, number?][]): Eff {
  return function* (g, c) {
    const ok = options.filter((o) => !o[2] || o[2](g, c))
    if (!ok.length) return false
    const o = yield* g.ask(c.p, 'choose', 'Choose one of the following.', ok.map((x, i) => ({ t: 'opt', label: x[0], n: i, w: x[3] ?? 1 })))
    yield* ok[o.n!][1](g, c)
    return true
  }
}

// ---------- effects ----------
export const draw = (n = 1): Eff => function* (g, c) { yield* g.drawFx(c.p, n) }
export const drawUpTo = (n = 1): Eff => function* (g, c) {
  if (!(yield* g.yesNo(c.p, `Draw ${n} card?`, 1))) return false
  yield* g.drawFx(c.p, n)
}
export const drawTo = (n: number): Eff => function* (g, c) { const k = n - g.P(c.p).hand.length; if (k > 0) yield* g.drawFx(c.p, k) }
export const discardN = (n = 1, test: CP = ANY): Eff => function* (g, c) { yield* g.chooseDiscard(c.p, n, (u) => test(g, u)) }
export const self = (k: Param, n: number): Eff => function* (g, c) { g.pump(c.uid, k, n) }
export const fixSelf = (k: Param, n: number): Eff => function* (g, c) { g.fix(c.uid, k, n) }
export const selfParam = (n: number): Eff => function* (g, c) {
  const k = yield* g.pickParam(c.p, c.uid, `Choose 1 parameter of ${g.name(c.uid)} to get +${n}.`)
  if (k) g.pump(c.uid, k, n)
}
/** Weight the computer gives a character when a skill asks it to pick one to boost. */
const aim = (g: HQ, c: Ctx, uid: number, k: Param) => {
  const area = g.areaOf(c.p, uid)
  const live = area && (area === 'center' || area === 'sides' ? 'bl' : area === 'serve' ? 'sv' : area === 'receive' ? 'rc' : area === 'set' ? 'st' : 'at')
  const now = g.s.phase === 'receive' ? 'rc' : g.s.phase === 'attack' || g.s.phase === 'set' ? (k === 'st' ? 'st' : 'at') : g.s.phase === 'block' ? 'bl' : g.s.phase === 'serve' ? 'sv' : ''
  return (live === k ? 4 : 1) + (now === k && live === k ? 4 : 0)
}
/** "One of your [team] characters gets +N [X] Point." */
export const one = (test: CP, k: Param, n: number, areas?: Area[]): Eff => function* (g, c) {
  const uid = yield* g.pickChar(c.p, c.p, `Choose one of your characters to get ${n >= 0 ? '+' : ''}${n} ${PN[k]} Point.`,
    (u, a) => test(g, u) && g.def(u)[k] != null && (!areas || areas.includes(a) || (areas.includes('center') && a === 'sides')), false, (u) => aim(g, c, u, k))
  if (uid == null) return false
  c.target = uid
  g.pump(uid, k, n)
  return true
}
/** "Choose 1 parameter of one of your [team] characters. That parameter gets +N." */
export const oneParam = (test: CP, n: number, areas?: Area[]): Eff => function* (g, c) {
  const uid = yield* g.pickChar(c.p, c.p, `Choose one of your characters to get +${n} to a parameter.`, (u, a) => test(g, u) && (!areas || areas.includes(a)), false,
    (u) => Math.max(...(['sv', 'bl', 'rc', 'st', 'at'] as Param[]).map((k) => aim(g, c, u, k))))
  if (uid == null) return false
  c.target = uid
  const k = yield* g.pickParam(c.p, uid)
  if (k) g.pump(uid, k, n)
  return true
}
export const that = (k: Param, n: number): Eff => function* (g, c) { if (c.target != null && g.areaOf(c.p, c.target)) g.pump(c.target, k, n) }
export const thatParam = (n: number): Eff => function* (g, c) {
  if (c.target == null) return false
  const k = yield* g.pickParam(c.p, c.target)
  if (k) g.pump(c.target, k, n)
}
export const fixThat = (k: Param, n: number): Eff => function* (g, c) { if (c.target != null) g.fix(c.target, k, n) }
/** Pick a character of yours to work on next, without boosting it yet. */
export const target = (test: CP, areas?: Area[]): Eff => function* (g, c) {
  const uid = yield* g.pickChar(c.p, c.p, 'Choose one of your characters.', (u, a) => test(g, u) && (!areas || areas.includes(a)))
  if (uid == null) return false
  c.target = uid
}
/** All of your characters in an Area that pass a test get +N. */
export const inArea = (area: Area, test: CP, k: Param, n: number): Eff => function* (g, c) {
  const t = g.top(c.p, area)
  if (t == null || !test(g, t)) return false
  c.target = t
  g.pump(t, k, n)
}

// ---------- rules for a while ----------
/** A rule for your opponent's next turn. */
export const next = (kind: string, data: Record<string, unknown> = {}): Eff => function* (g, c) {
  g.addRule(opp(c.p), 1, kind, src(g, c), data)
  g.say(`${src(g, c)}: ${RULE_TEXT[kind]?.(data) ?? 'a rule is in force during the next turn.'}`)
}
/** A rule for the rest of this turn. */
export const now = (kind: string, data: Record<string, unknown> = {}): Eff => function* (g, c) { g.addRule(c.p, 0, kind, src(g, c), data) }
/** A rule that helps you during your opponent's next turn. */
export const mine = (kind: string, data: Record<string, unknown> = {}): Eff => function* (g, c) { g.addRule(c.p, 1, kind, src(g, c), data) }
/** "During your opponent's next turn, whenever a character enters their [Area], that character gets −N." */
export const nextEnter = (areas: string[], k: Param, n: number, pred?: CP, fromHand = false): Eff =>
  next('enterMod', { areas, param: k, n, pred: pred && ((g: HQ, u: number) => pred(g, u)), fromHand })
export const nextFix = (areas: string[], k: Param, n: number, pred?: CP, fromHand = false): Eff =>
  next('enterMod', { areas, param: k, fixTo: n, pred: pred && ((g: HQ, u: number) => pred(g, u)), fromHand })
export const nextNoPlay = (areas: string[], pred?: (d: Def) => boolean, fromHand = false): Eff => next('noPlay', { areas, pred, fromHand })
/** "During this turn, whenever your [X] enters, that character gets +N." */
export const thisEnter = (test: CP, k: Param, n: number, areas: string[] = ['any'], extra: Record<string, unknown> = {}): Eff =>
  now('enterMod', { areas, param: k, n, pred: (g: HQ, u: number) => test(g, u), ...extra })
export const stuffed = (n: number): Eff => now('stuffed', { n })
export const blockOut = (n: number): Eff => next('blockOut', { n })
export const aPass = (n: number): Eff => now('aPass', { n })
export const feint = (n: number): Eff => function* (g, c) {
  g.addRule(c.p, 0, 'endOff', src(g, c), { n, label: 'Feint' })
  g.addRule(opp(c.p), 1, 'noBlock', src(g, c))
  g.say(`Feint (${n}): ${g.nm(opp(c.p))} cannot block next turn.`, { t: 'keyword', p: c.p })
}
export const deflection = (n: number): Eff => function* (g, c) {
  if (g.hasRule(c.p, 'noDeflection')) { g.say('Deflection cannot be used right now.'); return false }
  g.changeOff(opp(c.p), -n)
  g.say(`Deflection (${n})! The Block Phase ends and ${g.nm(c.p)} goes to the Draw Phase.`, { t: 'keyword', p: c.p })
  if (g.s.phase === 'block') throw new SkipBlock()
}
export const toDrawPhase: Eff = function* (g) {
  g.say('The Block Phase ends early.')
  if (g.s.phase === 'block') throw new SkipBlock()
}
export const dump = (n: number): Eff => function* (g, c) {
  if (g.s.phase !== 'set') return false
  g.addRule(opp(c.p), 1, 'noBlock', src(g, c))
  g.say(`Dump (${n})! ${g.nm(opp(c.p))} cannot block next turn.`, { t: 'keyword', p: c.p })
  g.declareOff(c.p, n, 'Attack')
  throw new SkipToEnd()
}
/** "[Back Attack (N)]": this card enters your Attack Area with an Attack Point of N. */
export const backAttack = (n: number): Eff => function* (g, c) {
  if (!g.canEnter(c.p, c.uid, 'attack', false) && g.def(c.uid).at == null) return false
  g.say(`Back Attack (${n})!`, { t: 'keyword', p: c.p })
  yield* g.enter(c.p, c.uid, 'attack', 'Back Attack')
  g.fix(c.uid, 'at', n)
  for (const r of g.rule(c.p, 'baBonus')) g.pump(c.uid, 'at', r.n as number)
}
export const oppOff = (n: number): Eff => function* (g, c) { g.changeOff(opp(c.p), n) }
export const oppDiscard = (n = 1, ifHandGE = 0): Eff => function* (g, c) {
  if (g.P(opp(c.p)).hand.length < ifHandGE) return false
  yield* g.chooseDiscard(opp(c.p), n)
}
export const coin = (heads: Eff[], tails: Eff[]): Eff => function* (g, c) {
  const h = g.rand() < 0.5
  g.say(`Coin flip: ${h ? 'heads' : 'tails'}.`, { t: 'coin', p: c.p })
  for (const e of h ? heads : tails) yield* e(g, c)
}

// ---------- moving cards ----------
type Zone = 'drop' | 'event' | 'guts' | 'hand' | 'court'
const pool = (g: HQ, c: Ctx, zone: Zone, test: CP, areas?: Area[]) => {
  const P = g.P(c.p)
  const list = zone === 'drop' ? P.drop : zone === 'event' ? P.event : zone === 'hand' ? P.hand
    : zone === 'court' ? g.chars(c.p).filter((x) => !areas || areas.includes(x.area)).map((x) => x.uid)
    : g.allGuts(c.p).filter((x) => !areas || areas.includes(x.area)).map((x) => x.uid)
  return list.filter((u) => test(g, u))
}
/** "Add up to N [cards] from your [zone] to your hand." Different names when asked. */
export const add = (zone: Zone, test: CP, n = 1, opts: { exact?: boolean; difNames?: boolean; areas?: Area[] } = {}): Eff => function* (g, c) {
  const got: number[] = []
  for (let i = 0; i < n; i++) {
    const list = pool(g, c, zone, test, opts.areas).filter((u) => !got.includes(u) && (!opts.difNames || !got.some((x) => g.def(x).name === g.def(u).name)))
    if (opts.exact && list.length < n - i) break
    const uid = yield* g.pickCard(c.p, `Choose a card from your ${zone === 'guts' ? 'Guts' : zone === 'drop' ? 'Drop Area' : zone === 'event' ? 'Event Area' : zone} to add to your hand.`, list, !opts.exact, (u) => g.worth(u), list)
    if (uid == null) break
    if (!(yield* g.addByAbility(c.p, uid))) break
    got.push(uid)
  }
  c.seen = got
  return opts.exact ? got.length === n : got.length > 0
}
/** "Look at the top N cards of your deck. Reveal up to M [cards], add them to your hand, put the rest on the bottom." */
export const look = (n: number, test: CP, max = 1, rest: 'bottom' | 'either' = 'bottom'): Eff => function* (g, c) {
  const P = g.P(c.p)
  const seen = P.deck.slice(-n).reverse()
  if (!seen.length) return false
  const got: number[] = []
  for (let i = 0; i < max; i++) {
    const list = seen.filter((u) => !got.includes(u) && test(g, u))
    const uid = yield* g.pickCard(c.p, `Top ${seen.length} cards of your deck. Choose one to add to your hand.`, list, true, (u) => g.worth(u), seen)
    if (uid == null) break
    got.push(uid)
  }
  const left = seen.filter((u) => !got.includes(u))
  const onTop = rest === 'either' && left.length > 0 && (yield* g.yesNo(c.p, 'Put the rest on top of your deck instead of the bottom?', 0))
  P.deck.splice(P.deck.length - seen.length)
  if (onTop) P.deck.push(...left.reverse())
  else P.deck.unshift(...left.reverse())
  for (const u of got) {
    P.deck.push(u)
    g.say(`${g.nm(c.p)} reveals ${g.def(u).name}.`, { t: 'reveal', p: c.p, uid: u })
    yield* g.addByAbility(c.p, u)
  }
  c.seen = got
  return got.length > 0
}
/** "Reveal the top card of your deck." The card stays there until another step moves it. */
export const reveal: Eff = function* (g, c) {
  const P = g.P(c.p)
  if (!P.deck.length) { c.seen = []; return false }
  const u = P.deck[P.deck.length - 1]
  c.seen = [u]
  g.say(`${g.nm(c.p)} reveals ${g.def(u).name} from the top of the deck.`, { t: 'reveal', p: c.p, uid: u })
}
export const seenToBottom: Eff = function* (g, c) {
  const P = g.P(c.p)
  for (const u of c.seen) { const i = P.deck.indexOf(u); if (i >= 0) { P.deck.splice(i, 1); P.deck.unshift(u) } }
}
export const seenToHand = (test: CP = ANY): Eff => function* (g, c) {
  const got = c.seen.filter((u) => test(g, u) && g.P(c.p).deck.includes(u))
  for (const u of got) yield* g.addByAbility(c.p, u)
  return got.length > 0
}
/** "Play up to 1 [card] from your [zone] into your [Area]." */
export const play = (zone: Zone, test: CP, area: Area, opts: { areas?: Area[]; must?: boolean } = {}): Eff => function* (g, c) {
  const list = pool(g, c, zone, test, opts.areas).filter((u) => u !== c.uid && g.canEnter(c.p, u, area, zone === 'hand'))
  const uid = yield* g.pickCard(c.p, `Choose a card to play into your ${area === 'sides' ? 'Block Area as a Side Blocker' : area + ' Area'}.`, list, !opts.must, (u) => (g.def(u)[area === 'sides' || area === 'center' ? 'bl' : area === 'serve' ? 'sv' : area === 'receive' ? 'rc' : area === 'set' ? 'st' : 'at'] ?? 0) + 1, list)
  if (uid == null) return false
  if (area === 'sides' && (g.P(c.p).sides.length >= 2 || g.blockers(c.p).some((x) => g.name(x.uid) === g.def(uid).name))) return false
  yield* g.enter(c.p, uid, area, src(g, c))
  c.target = uid
  return true
}
/** This card itself enters another Area (from the court or the hand). */
export const enterSelf = (area: Area): Eff => function* (g, c) {
  if (area === 'sides' && (g.P(c.p).sides.length >= 2 || !g.top(c.p, 'center') || g.blockers(c.p).some((x) => x.uid !== c.uid && g.name(x.uid) === g.def(c.uid).name))) return false
  if (!g.canEnter(c.p, c.uid, area, false)) return false
  yield* g.enter(c.p, c.uid, area, src(g, c))
  c.target = c.uid
}
/** Send cards from the opponent's Event Area to their Drop Area. */
export const oppEventToDrop = (n: number, test: CP = ANY): Eff => function* (g, c) {
  let k = 0
  for (let i = 0; i < n; i++) {
    const list = g.P(opp(c.p)).event.filter((u) => test(g, u))
    const uid = yield* g.pickCard(c.p, "Choose a card in your opponent's Event Area to send to their Drop Area.", list, true, () => 1, list)
    if (uid == null) break
    g.toDrop(uid)
    k++
  }
  c.seen = Array(k).fill(0)
}
export const oppGutsToDrop = (n: number, areas?: Area[], test: CP = ANY): Eff => function* (g, c) {
  for (let i = 0; i < n; i++) {
    const list = g.allGuts(opp(c.p)).filter((x) => (!areas || areas.includes(x.area)) && test(g, x.uid)).map((x) => x.uid)
    const uid = yield* g.pickCard(c.p, "Choose your opponent's Guts to send to their Drop Area.", list, true, () => 1, list)
    if (uid == null) break
    g.toDrop(uid)
  }
}
/** Put cards from one zone on the bottom of the deck. */
export const toBottom = (zone: Zone, test: CP, n = 1): Eff => function* (g, c) {
  for (let i = 0; i < n; i++) {
    const list = pool(g, c, zone, test)
    const uid = yield* g.pickCard(c.p, 'Choose a card to put on the bottom of your deck.', list, true, () => 1, list)
    if (uid == null) break
    g.lift(uid)
    g.P(c.p).deck.unshift(uid)
  }
}

// ---------- reacting to other cards ----------
type WatchOpts = { areas: string[]; test?: (g: HQ, uid: number, e: Watch & { t: 'enter' }) => boolean; selfIn?: Area[]; fromHand?: boolean; cost?: Cost; cond?: Cond; theirs?: boolean }
/** "When a [character] enters your [Area], if this character is in your [Area], ..." */
export function onEnter(o: WatchOpts, ...effs: Eff[]): HQScript['watch'] {
  return (g, c, e) => {
    if (e.t !== 'enter' || (o.theirs ? e.p === c.p : e.p !== c.p)) return null
    const block = e.area === 'center' || e.area === 'sides'
    if (!(o.areas.includes(e.area) || (block && o.areas.includes('block')) || o.areas.includes('any'))) return null
    if (o.selfIn && (!c.area || !o.selfIn.includes(c.area))) return null
    if (o.fromHand && e.entry.from !== 'hand') return null
    if (o.test && !o.test(g, e.uid, e)) return null
    return (function* () {
      c.target = e.uid
      c.entered = e.uid
      if (o.cond && !o.cond(g, c)) return false
      if (o.cost) return (yield* may(o.cost, ...effs)(g, c)) !== false
      for (const f of effs) yield* f(g, c)
      return true
    })()
  }
}
/** "When a [character] enters on top of this character in your [Area], ..." */
export function onTop(test: CP, cost: Cost | null, ...effs: Eff[]): HQScript['watch'] {
  return (g, c, e) => {
    if (e.t !== 'enter' || e.p !== c.p || c.area !== undefined || e.entry.onTop !== c.uid || !test(g, e.uid)) return null
    return (function* () {
      c.target = e.uid
      if (cost) return (yield* may(cost, ...effs)(g, c)) !== false
      for (const f of effs) yield* f(g, c)
      return true
    })()
  }
}
/** "When your [Event] is played, if this character is in your [Area], ..." */
export function onEvent(test: CP, selfIn: Area[], cost: Cost | null, cond: Cond | null, ...effs: Eff[]): HQScript['watch'] {
  return (g, c, e) => {
    if (e.t !== 'event' || e.p !== c.p || !c.area || !selfIn.includes(c.area) || !test(g, e.uid)) return null
    if (cond && !cond(g, c)) return null
    return (function* () {
      if (cost) return (yield* may(cost, ...effs)(g, c)) !== false
      for (const f of effs) yield* f(g, c)
      return true
    })()
  }
}

// ---------- card shapes ----------
export const E = (areas: (Area | 'block' | 'court')[], ...effs: Eff[]): HQScript => ({ enter: { areas, run: seq(...effs) as (g: HQ, c: Ctx) => Gen } })
export const EV = (phases: Phase[], ...effs: Eff[]): HQScript => ({ event: { phases, run: seq(...effs) as (g: HQ, c: Ctx) => Gen } })
export const EV1 = (phases: Phase[], ...effs: Eff[]): HQScript => ({ event: { phases, run: seq(...effs) as (g: HQ, c: Ctx) => Gen, turn1: true } })
export const EVIF = (phases: Phase[], can: Cond, ...effs: Eff[]): HQScript => ({ event: { phases, run: seq(...effs) as (g: HQ, c: Ctx) => Gen, can: (g, p) => can(g, { p, uid: -1, paid: [], seen: [] }) } })
export const HAND = (phases: Phase[], cost: 'discard' | 'event', ...effs: Eff[]): HQScript => ({ hand: { phases, cost, run: seq(...effs) as (g: HQ, c: Ctx) => Gen } })
export const HAND1 = (phases: Phase[], cost: 'discard' | 'event', ...effs: Eff[]): HQScript => ({ hand: { phases, cost, run: seq(...effs) as (g: HQ, c: Ctx) => Gen, turn1: true } })
export const ALIAS = (a: string, b: string): HQScript => ({ alias: [a, b] })

const RULE_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  enterMod: (d) => d.fixTo != null ? `next turn, characters entering their ${(d.areas as string[]).join(' or ')} Area have ${PN[d.param as Param]} Point ${d.fixTo}.` : `next turn, characters entering their ${(d.areas as string[]).join(' or ')} Area get ${(d.n as number) >= 0 ? '+' : ''}${d.n} ${PN[d.param as Param]} Point.`,
  noPlay: (d) => `next turn, some characters cannot enter their ${(d.areas as string[]).join(' or ')} Area.`,
  blockMax: (d) => `next turn, they can block with no more than ${d.n}.`,
  noBlock: () => 'next turn, they cannot block.',
  blockOut: (d) => `Block Out (${d.n}): next turn, blocking with a character of original Block Point ${d.n} or less loses the set.`,
  noEvent: () => 'next turn, some Event cards cannot be played.',
  eventNoSkill: () => 'next turn, some Event skills cannot be used.',
  silence: () => 'next turn, some of their characters cannot use their skills.',
  noDeflection: () => 'next turn, they cannot use Deflection.',
  noStuffed: () => 'next turn, they cannot use Stuffed.',
  noHandSkill: () => 'next turn, they cannot use skills from their hand.',
  centerNoBlock: () => "next turn, their Center Blocker has no Block Point.",
  blockFailIf: (d) => `next turn, their block fails at ${d.n} or less.`,
  noAdd: () => 'next turn, they cannot add cards to their hand by skills.',
  drawOnAdd: () => 'next turn, whenever they add a card to their hand by a skill, this player draws 1.',
  discardOnAdd: () => 'next turn, whenever they add a card to their hand by a skill, they discard 1.',
  millOnAdd: () => 'next turn, whenever they add a card to their hand by a skill, they mill 3.',
  noDrawPhaseAdd: () => 'next turn, they cannot add cards to their hand in their Draw Phase.',
  sideToDrop: () => 'next turn, the first Side Blocker they play goes to the Drop Area.',
  drawOnBlocker: () => 'next turn, this player draws when they block with a strong blocker.',
}
