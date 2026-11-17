// Haikyu!! VOBACA!! BREAK rules engine. Follows the Comprehensive Rules, version 1.06.
//
// Like the HORO-BEAT engine, the whole match is one generator: it runs until a player has
// to decide something, hands out a request with the legal options, and continues when it
// gets the answer. A match is fully described by its setup plus the list of answers.
import raw from '../../haikyu.json' with { type: 'json' }
import { HQ_SCRIPTS } from './scripts.js'
import { SkipBlock, SkipToEnd } from './flow.js'

export type Side = 0 | 1
export type Param = 'sv' | 'bl' | 'rc' | 'st' | 'at'
export type Area = 'serve' | 'center' | 'sides' | 'receive' | 'set' | 'attack'
export type Phase = 'setup' | 'serve' | 'start' | 'block' | 'draw' | 'receive' | 'set' | 'attack' | 'end' | 'over'
export const PARAMS: Param[] = ['sv', 'bl', 'rc', 'st', 'at']
export const PNAME: Record<Param, string> = { sv: 'Serve', bl: 'Block', rc: 'Receive', st: 'Set', at: 'Attack' }
/** Which parameter each Area uses. */
export const AREA_PARAM: Record<Area, Param> = { serve: 'sv', center: 'bl', sides: 'bl', receive: 'rc', set: 'st', attack: 'at' }
export const AREA_NAME: Record<Area, string> = { serve: 'Serve Area', center: 'Block Area', sides: 'Block Area', receive: 'Receive Area', set: 'Set Area', attack: 'Attack Area' }

export type Def = {
  id: string; no: string; name: string; type: 'Character' | 'Event'; aff: string
  schools: string[]; years: string[]; pos: string[]
  sv: number | null; bl: number | null; rc: number | null; st: number | null; at: number | null
  text: string; en: number; v?: number
}
export const DEFS = new Map<string, Def>((raw as Def[]).map((c) => [c.id, c]))

export type Opt = { t: string; label: string; uid?: number; area?: Area; side?: Side; param?: Param; n?: number; w?: number }
export type Req = { p: Side; kind: string; text: string; opts: Opt[]; show?: number[] }
export type PS = {
  deck: number[] // the last card is the top of the deck
  hand: number[]; drop: number[]; event: number[]; score: number[]
  serve: number[]; center: number[]; sides: number[]; receive: number[]; set: number[]; attack: number[] // last card is on top
}
export type Entry = { from: 'hand' | 'drop' | 'guts' | 'deck' | 'court' | 'event'; by: string; onTop: number | null; turn: number; asSide: boolean }
/** A rule a card put in force for a while, such as "during your opponent's next turn ...". */
export type Rule = { side: Side; turn: number; kind: string; src: string; [k: string]: unknown }
export type State = {
  ps: [PS, PS]
  cards: string[]
  serveRight: Side
  turn: Side
  turnNo: number
  setNo: number
  phase: Phase
  mode: 'block' | 'receive' | 'serve' | null
  off: [number | null, number | null] // each player's last declared Offense Point
  offKind: [string, string]
  def: number | null
  sets: [number, number] // sets taken
  winner: Side | null
  reason: string
  rules: Rule[]
  mods: Record<number, { add: Partial<Record<Param, number>>; fix: Partial<Record<Param, number>>; noReduce?: boolean; none?: Param[] }>
  alias: Record<number, string>
  entry: Record<number, Entry>
  turn1: [string[], string[]]
  once: string[]
}
export type View = {
  ps: [PS, PS]; turn: Side; turnNo: number; setNo: number; phase: Phase; mode: State['mode']; serveRight: Side
  off: [number | null, number | null]; offKind: [string, string]; def: number | null; sets: [number, number]
  pv: Record<number, Record<Param, number | null>>; alias: Record<number, string>
}
export type Ev = { t: string; text: string; p?: Side; uid?: number; area?: Area; n?: number; win?: boolean; view: View }
type Fx = Omit<Ev, 'text' | 'view'>
export type Setup = { seed: number; decks: [string[], string[]]; names: [string, string] }
export type Gen<T = void> = Generator<Req, T, number>

/** What a card's text does. Every hook is optional. */
export type Ctx = { p: Side; uid: number; area?: Area; target?: number; paid: number[]; seen: number[]; entered?: number; by?: string }
export type HQScript = {
  /** [Enter] skills: the Areas the card must enter for the skill to work. 'court' means any. */
  enter?: { areas: (Area | 'block' | 'court')[]; run: (g: HQ, c: Ctx) => Gen }
  /** Skills that react to something else happening, such as another character entering. */
  watch?: (g: HQ, c: Ctx, e: Watch) => Gen<boolean> | null
  /** Event cards: the phases they can be played in, and what they do. */
  event?: { phases: Phase[]; run: (g: HQ, c: Ctx) => Gen; can?: (g: HQ, p: Side) => boolean; turn1?: boolean }
  /** Character skills used from the hand, such as "[Receive Phase][Hand] Discard this card: ...". */
  hand?: { phases: Phase[]; cost: 'discard' | 'event' | 'none'; run: (g: HQ, c: Ctx) => Gen; can?: (g: HQ, p: Side) => boolean; turn1?: boolean }
  /** Two names, of which the player picks one when the card enters. */
  alias?: [string, string]
  /** Rough worth of the card's skill to the computer player, from 0 to 3. */
  value?: number
}
export type Watch =
  | { t: 'enter'; p: Side; uid: number; area: Area; entry: Entry }
  | { t: 'event'; p: Side; uid: number; fromHand: boolean }

class LostSet {
  constructor(public p: Side, public why: string) {}
}
class Over {
  constructor(public winner: Side, public reason: string) {}
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const opp = (p: Side) => (1 - p) as Side
const AREAS: Area[] = ['serve', 'center', 'sides', 'receive', 'set', 'attack']
const NONE: HQScript = {}

/** A skill that has triggered and is waiting to resolve. */
export type Waiting = { p: Side; uid: number; label: string; run: Gen<unknown>; still: () => boolean }

export class HQ {
  s: State
  req: Req | null = null
  log: { round: number; text: string }[] = []
  answers: number[] = []
  record = false
  events: Ev[] = []
  rand: () => number
  private gen: Gen

  constructor(public setup: Setup) {
    this.rand = mulberry32(setup.seed)
    const cards: string[] = []
    const mk = (ids: string[]): PS => ({
      deck: ids.map((id) => cards.push(id) - 1), hand: [], drop: [], event: [], score: [],
      serve: [], center: [], sides: [], receive: [], set: [], attack: [],
    })
    const a = mk(setup.decks[0])
    const b = mk(setup.decks[1])
    this.s = {
      ps: [a, b], cards, serveRight: 0, turn: 0, turnNo: 0, setNo: 0, phase: 'setup', mode: null,
      off: [null, null], offKind: ['', ''], def: null, sets: [0, 0], winner: null, reason: '',
      rules: [], mods: {}, alias: {}, entry: {}, turn1: [[], []], once: [],
    }
    this.gen = this.run()
    this.step()
  }
  static replay(setup: Setup, answers: number[]) {
    const m = new HQ(setup)
    for (const a of answers) m.answer(a)
    return m
  }
  answer(i: number) {
    if (!this.req || !Number.isInteger(i) || i < 0 || i >= this.req.opts.length) throw new Error('That is not a legal choice.')
    this.answers.push(i)
    this.step(i)
  }
  private step(v?: number) {
    try {
      const r = this.gen.next(v as number)
      this.req = r.done ? null : r.value
    } catch (e) {
      if (!(e instanceof Over)) throw e
      this.finish(e)
    }
  }
  private finish(e: Over) {
    this.s.winner = e.winner
    this.s.reason = e.reason
    this.s.phase = 'over'
    this.req = null
    this.say(`${this.nm(e.winner)} wins the match. ${e.reason}`, { t: 'victory', p: e.winner })
  }

  // ---------- reading the table ----------
  P(p: Side) { return this.s.ps[p] }
  nm(p: Side) { return this.setup.names[p] }
  def(uid: number) { return DEFS.get(this.s.cards[uid])! }
  sc(uid: number): HQScript { return HQ_SCRIPTS[this.def(uid).no] || NONE }
  /** A card's name, or the name chosen for it this turn. */
  name(uid: number) { return this.s.alias[uid] || this.def(uid).name }
  isChar(uid: number) { return this.def(uid).type === 'Character' }
  top(p: Side, area: Area): number | null {
    if (area === 'sides') return null
    const st = this.P(p)[area]
    return st.length ? st[st.length - 1] : null
  }
  /** Every character on a player's court, with the Area it is in. */
  chars(p: Side): { uid: number; area: Area }[] {
    const out: { uid: number; area: Area }[] = []
    for (const area of ['serve', 'center', 'receive', 'set', 'attack'] as Area[]) {
      const t = this.top(p, area)
      if (t != null) out.push({ uid: t, area })
    }
    for (const uid of this.P(p).sides) out.push({ uid, area: 'sides' })
    return out
  }
  blockers(p: Side) { return this.chars(p).filter((c) => c.area === 'center' || c.area === 'sides') }
  areaOf(p: Side, uid: number): Area | null {
    if (this.P(p).sides.includes(uid)) return 'sides'
    for (const a of ['serve', 'center', 'receive', 'set', 'attack'] as Area[]) if (this.top(p, a) === uid) return a
    return null
  }
  /** The cards under a character (its Guts). */
  guts(p: Side, area: Area): number[] {
    if (area === 'sides') return []
    const st = this.P(p)[area]
    return st.slice(0, -1)
  }
  allGuts(p: Side) { return (['serve', 'center', 'receive', 'set', 'attack'] as Area[]).flatMap((a) => this.guts(p, a).map((uid) => ({ uid, area: a }))) }
  /** A character's current parameter, or null when it has none ("－"). */
  param(uid: number, k: Param): number | null {
    const base = this.def(uid)[k]
    const m = this.s.mods[uid]
    if (base == null) return null
    if (m?.none?.includes(k)) return null
    // A "becomes N" effect replaces everything before it; later +N and −N effects add on top (rule 0-2-12).
    const add = m?.add[k] || 0
    const from = m && m.fix[k] != null ? m.fix[k]! : base
    return from + (m?.noReduce && add < 0 ? 0 : add)
  }
  has(uid: number, team: string) { return this.def(uid).schools.includes(team) || this.def(uid).aff.includes(team) }
  isPos(uid: number, pos: string) { return this.def(uid).pos.includes(pos) }
  allTeam(p: Side, team: string) {
    const cs = this.chars(p)
    return cs.length > 0 && cs.every((c) => this.has(c.uid, team))
  }
  /** "The character in your Set Area is X." */
  isAt(p: Side, area: Area, name: string) {
    const t = this.top(p, area)
    return t != null && this.name(t) === name
  }
  noSkill(uid: number) { return !this.def(uid).text.trim() }
  rule(side: Side, kind: string) { return this.s.rules.filter((r) => r.side === side && r.kind === kind && (r.turn === this.s.turnNo || r.turn === -1)) }
  hasRule(side: Side, kind: string) { return this.rule(side, kind).length > 0 }
  /** A character's skills do nothing while a rule says so. */
  silenced(p: Side, uid: number) {
    const area = this.areaOf(p, uid)
    if (this.s.turn1[p].includes(this.def(uid).name) || this.s.turn1[p].includes(this.name(uid))) return true
    for (const r of this.rule(p, 'silence')) {
      const areas = r.areas as string[] | undefined
      const names = r.names as string[] | undefined
      if (names && names.includes(this.name(uid))) return true
      if (areas && area && (areas.includes(area) || (areas.includes('block') && (area === 'center' || area === 'sides')))) return true
    }
    return false
  }
  eventCount(p: Side, pred?: (d: Def) => boolean) { return this.P(p).event.filter((u) => !pred || pred(this.def(u))).length }
  timings(uid: number): Phase[] {
    const m = /^((?:\[[A-Za-z ]+\])+)/.exec(this.def(uid).text.trim())
    if (!m) return []
    return [...m[1].matchAll(/\[([A-Za-z]+)\]/g)].map((x) => x[1].toLowerCase() as Phase).filter((x) => ['serve', 'block', 'draw', 'receive', 'set', 'attack'].includes(x))
  }
  snapshot(): View {
    const pv: View['pv'] = {}
    for (const p of [0, 1] as Side[]) for (const c of this.chars(p)) pv[c.uid] = { sv: this.param(c.uid, 'sv'), bl: this.param(c.uid, 'bl'), rc: this.param(c.uid, 'rc'), st: this.param(c.uid, 'st'), at: this.param(c.uid, 'at') }
    const s = this.s
    return {
      ps: JSON.parse(JSON.stringify(s.ps)), turn: s.turn, turnNo: s.turnNo, setNo: s.setNo, phase: s.phase, mode: s.mode, serveRight: s.serveRight,
      off: [...s.off] as View['off'], offKind: [...s.offKind] as View['offKind'], def: s.def, sets: [...s.sets] as View['sets'], pv, alias: { ...s.alias },
    }
  }

  // ---------- small actions ----------
  say(text: string, fx: Fx = { t: 'note' }) {
    if (this.setup.names.includes('You')) {
      text = text
        .replace(/\bYou's\b/g, 'your')
        .replace(/\bYou (has|is|goes|[A-Za-z]+s)\b/g, (_m, v: string) => `You ${v === 'has' ? 'have' : v === 'is' ? 'are' : v === 'goes' ? 'go' : v.slice(0, -1)}`)
        .replace(/^your/, 'Your')
    }
    this.log.push({ round: this.s.setNo, text })
    if (this.record) this.events.push({ ...fx, text, view: this.snapshot() })
  }
  shuffle(list: number[]) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  }
  draw(p: Side, n: number, quiet = false) {
    const P = this.P(p)
    let got = 0
    for (let i = 0; i < n && P.deck.length; i++, got++) P.hand.push(P.deck.pop()!)
    if (got && !quiet) this.say(`${this.nm(p)} draws ${got} card${got === 1 ? '' : 's'}.`, { t: 'draw', p, n: got })
    // "Whenever they add a card to their hand" (without "except by drawing") also counts draws.
    if (got) for (const r of this.rule(p, 'drawOnAdd')) if (r.all) { const who = r.owner as Side; this.say(`${r.src}: ${this.nm(who)} draws for each card added.`); this.draw(who, got) }
    return got
  }
  /** Take a card out of wherever it is now. */
  lift(uid: number): { p: Side; from: Entry['from'] } | null {
    for (const p of [0, 1] as Side[]) {
      const P = this.P(p)
      for (const key of ['hand', 'drop', 'event', 'deck', 'score'] as const) {
        const i = P[key].indexOf(uid)
        if (i >= 0) { P[key].splice(i, 1); return { p, from: key === 'hand' ? 'hand' : key === 'drop' ? 'drop' : key === 'event' ? 'event' : 'deck' } }
      }
      const si = P.sides.indexOf(uid)
      if (si >= 0) { P.sides.splice(si, 1); delete this.s.mods[uid]; return { p, from: 'court' } }
      for (const area of ['serve', 'center', 'receive', 'set', 'attack'] as Area[]) {
        const st = P[area]
        const i = st.indexOf(uid)
        if (i < 0) continue
        const wasTop = i === st.length - 1
        st.splice(i, 1)
        delete this.s.mods[uid]
        return { p, from: wasTop ? 'court' : 'guts' }
      }
    }
    return null
  }
  toDrop(uid: number, quiet = false) {
    const at = this.lift(uid)
    if (!at) return
    this.P(at.p).drop.push(uid)
    if (!quiet) this.say(`${this.name(uid)} goes to the Drop Area.`, { t: 'drop', p: at.p, uid })
    if (at.from === 'event') for (const r of this.rule(at.p, 'drawOnLeaveEvent')) if (r.uid === uid && !this.s.once.includes(`leave${uid}${r.turn}`)) {
      this.s.once.push(`leave${uid}${r.turn}`)
      this.say(`${r.src}: ${this.nm(at.p)} draws 1 card.`)
      this.draw(at.p, 1)
    }
  }
  toHand(uid: number, quiet = false) {
    const at = this.lift(uid)
    if (!at) return
    this.P(at.p).hand.push(uid)
    if (!quiet) this.say(`${this.nm(at.p)} adds ${this.name(uid)} to their hand.`, { t: 'add', p: at.p, uid })
    return at
  }
  /** A card added to the hand by a skill, which some rules react to. */
  *addByAbility(p: Side, uid: number): Gen<boolean> {
    if (this.hasRule(p, 'noAdd')) { this.say(`${this.nm(p)} cannot add cards to their hand right now.`); return false }
    this.toHand(uid)
    yield* this.afterAdd(p, 1)
    return true
  }
  *afterAdd(p: Side, n: number): Gen {
    for (const r of this.rule(p, 'drawOnAdd')) { const who = r.owner as Side; this.say(`${this.nm(who)}'s skill: ${this.nm(who)} draws for each card added.`); this.draw(who, n) }
    for (const _r of this.rule(p, 'discardOnAdd')) yield* this.chooseDiscard(p, n)
    for (const _r of this.rule(p, 'millOnAdd')) {
      const P = this.P(p)
      const cut = P.deck.splice(Math.max(0, P.deck.length - 3 * n))
      P.drop.push(...cut)
      if (cut.length) this.say(`${this.nm(p)} sends ${cut.length} cards from the top of their deck to the Drop Area.`, { t: 'mill', p, n: cut.length })
    }
  }
  *drawFx(p: Side, n: number): Gen<number> {
    if (this.hasRule(p, 'noAdd') || (this.s.phase === 'draw' && this.hasRule(p, 'noDrawPhaseAdd'))) { this.say(`${this.nm(p)} cannot add cards to their hand right now.`); return 0 }
    return this.draw(p, n)
  }
  *chooseDiscard(p: Side, n: number, pred?: (uid: number) => boolean, text?: string): Gen<number[]> {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const pool = this.P(p).hand.filter((u) => !pred || pred(u))
      const uid = yield* this.pickCard(p, text || 'Choose a card from your hand to discard.', pool, false, (u) => 10 - this.worth(u))
      if (uid == null) break
      this.toDrop(uid, true)
      this.say(`${this.nm(p)} discards ${this.name(uid)}.`, { t: 'discard', p, uid })
      out.push(uid)
    }
    return out
  }
  /** How useful a card in hand looks, for the computer's choices. */
  worth(uid: number) {
    const d = this.def(uid)
    if (d.type === 'Event') return 4 + (this.sc(uid).value ?? 1)
    const best = Math.max(d.rc ?? 0, (d.st ?? 0) * 2 + 1, d.at ?? 0, d.sv ?? 0, d.bl ?? 0)
    return best + (this.sc(uid).value ?? (d.text ? 1 : 0))
  }

  // ---------- parameters ----------
  /** "This character gets +N X Point." */
  pump(uid: number, k: Param, n: number, quiet = false) {
    if (this.def(uid)[k] == null) return
    const m = (this.s.mods[uid] ??= { add: {}, fix: {} })
    if (n < 0 && m.noReduce) { this.say(`${this.name(uid)}'s parameters cannot be reduced.`); return }
    m.add[k] = (m.add[k] || 0) + n
    if (!quiet) this.say(`${this.name(uid)} gets ${n >= 0 ? '+' : ''}${n} ${PNAME[k]} Point.`, { t: n >= 0 ? 'pump' : 'cut', uid, n })
  }
  /** "Set its X Point to N." */
  fix(uid: number, k: Param, n: number) {
    if (this.def(uid)[k] == null) return
    const m = (this.s.mods[uid] ??= { add: {}, fix: {} })
    m.fix[k] = n
    m.add[k] = 0
    this.say(`${this.name(uid)}'s ${PNAME[k]} Point becomes ${n}.`, { t: 'pump', uid, n })
  }
  noReduce(uid: number) { (this.s.mods[uid] ??= { add: {}, fix: {} }).noReduce = true }
  /** Change the Offense Point a player declared earlier. */
  changeOff(p: Side, n: number) {
    if (this.s.off[p] == null) return
    if (n < 0 && this.hasRule(p, 'offNoReduce')) { this.say(`${this.nm(p)}'s Offense Point cannot be reduced.`); return }
    this.s.off[p] = this.s.off[p]! + n
    this.say(`${this.nm(p)}'s Offense Point ${n >= 0 ? 'rises' : 'drops'} to ${this.s.off[p]}.`, { t: 'off', p, n: this.s.off[p]! })
  }
  /** Put a rule in force for a turn. `turn` is relative: 0 = this turn, 1 = the opponent's next turn. */
  addRule(side: Side, rel: number, kind: string, src: string, data: Record<string, unknown> = {}) {
    this.s.rules.push({ side, turn: rel < 0 ? -1 : this.s.turnNo + rel, kind, src, ...data })
  }

  // ---------- asking ----------
  *ask(p: Side, kind: string, text: string, opts: Opt[], show?: number[]): Gen<Opt> {
    if (!opts.length) throw new Error(`No options for ${kind}`)
    const i = yield { p, kind, text, opts, show }
    return opts[i]
  }
  *yesNo(p: Side, text: string, w = 1, show?: number[]): Gen<boolean> {
    const o = yield* this.ask(p, 'confirm', text, [{ t: 'yes', label: 'Yes', w }, { t: 'no', label: 'No', w: 0 }], show)
    return o.t === 'yes'
  }
  *pickCard(p: Side, text: string, uids: number[], optional: boolean, weight?: (uid: number) => number, show?: number[]): Gen<number | null> {
    if (!uids.length) return null
    const opts: Opt[] = uids.map((uid) => ({ t: 'card', uid, label: this.name(uid), w: weight ? weight(uid) : 1 }))
    if (optional) opts.push({ t: 'no', label: "Don't", w: 0.5 })
    const o = yield* this.ask(p, 'pick', text, opts, show)
    return o.t === 'card' ? o.uid! : null
  }
  /** Pick one character on a player's court. */
  *pickChar(asker: Side, side: Side, text: string, pred: (uid: number, area: Area) => boolean, optional = false, weight?: (uid: number, area: Area) => number): Gen<number | null> {
    const cs = this.chars(side).filter((c) => pred(c.uid, c.area))
    if (!cs.length) return null
    if (cs.length === 1 && !optional) return cs[0].uid
    const opts: Opt[] = cs.map((c) => ({ t: 'card', uid: c.uid, area: c.area, side, label: `${this.name(c.uid)} (${AREA_NAME[c.area]})`, w: weight ? weight(c.uid, c.area) : 1 }))
    if (optional) opts.push({ t: 'no', label: "Don't", w: 0.3 })
    const o = yield* this.ask(asker, 'pick', text, opts)
    return o.t === 'card' ? o.uid! : null
  }
  /** "Choose 1 parameter of this character." The computer favors the one its Area uses. */
  *pickParam(p: Side, uid: number, text = 'Choose a parameter.'): Gen<Param | null> {
    const ks = PARAMS.filter((k) => this.def(uid)[k] != null)
    if (!ks.length) return null
    const area = this.areaOf(p, uid)
    const want = area ? AREA_PARAM[area] : null
    if (ks.length === 1) return ks[0]
    const o = yield* this.ask(p, 'param', `${text} (${this.name(uid)})`, ks.map((k) => ({ t: 'param', param: k, uid, label: `${PNAME[k]} Point`, w: k === want ? 5 : k === 'at' || k === 'rc' ? 2 : 1 })))
    return o.param!
  }

  // ---------- paying ----------
  /** Guts a player could pay from the given Areas (all of the court if none named). */
  payable(p: Side, areas?: Area[], pred?: (uid: number) => boolean) {
    return this.allGuts(p).filter((g) => (!areas || areas.includes(g.area)) && (!pred || pred(g.uid)))
  }
  /** Pay N Guts. The computer pays from the deepest Guts first. */
  *payGuts(p: Side, n: number, areas?: Area[], pred?: (uid: number) => boolean, prefer?: Area): Gen<number[]> {
    const paid: number[] = []
    for (let i = 0; i < n; i++) {
      const pool = this.payable(p, areas, pred)
      if (!pool.length) break
      const uid = yield* this.pickCard(p, `Choose Guts to pay (${i + 1} of ${n}).`, pool.map((g) => g.uid), false,
        (u) => { const g = pool.find((x) => x.uid === u)!; return (g.area === prefer ? 3 : 1) + (this.P(p)[g.area].indexOf(u) === 0 ? 1 : 0) - this.worth(u) / 20 })
      if (uid == null) break
      this.toDrop(uid, true)
      paid.push(uid)
    }
    if (paid.length) this.say(`${this.nm(p)} pays ${paid.length} Guts.`, { t: 'pay', p, n: paid.length })
    return paid
  }

  // ---------- entering ----------
  /** Whether a card may enter an Area right now, under the rules in force. */
  canEnter(p: Side, uid: number, area: Area, fromHand = true) {
    const d = this.def(uid)
    if (d.type !== 'Character') return false
    const k = AREA_PARAM[area]
    if (d[k] == null) return false
    for (const r of this.rule(p, 'noPlay')) {
      const areas = r.areas as string[]
      const block = area === 'center' || area === 'sides'
      if (!(areas.includes(area) || (block && areas.includes('block')))) continue
      if (r.fromHand && !fromHand) continue
      const f = r.pred as ((d: Def, uid: number) => boolean) | undefined
      if (!f || f(d, uid)) return false
    }
    if ((area === 'center' || area === 'sides') && this.hasRule(p, 'noBlock')) return false
    return true
  }
  /** Put a character card into an Area as a character, and resolve what that triggers. */
  *enter(p: Side, uid: number, area: Area, by = '', quiet = false, defer?: Waiting[]): Gen<boolean> {
    const at = this.lift(uid)
    const from = at?.from ?? 'hand'
    const P = this.P(p)
    let under: number | null = null
    if (area === 'sides') P.sides.push(uid)
    else {
      under = this.top(p, area)
      if (under != null) { delete this.s.mods[under]; delete this.s.alias[under] }
      P[area].push(uid)
    }
    const entry: Entry = { from, by, onTop: under, turn: this.s.turnNo, asSide: area === 'sides' }
    this.s.entry[uid] = entry
    const sc = this.sc(uid)
    if (sc.alias) {
      const clash = area === 'set' ? this.top(p, 'receive') : area === 'attack' ? this.top(p, 'set') : null
      const taken = [clash != null ? this.name(clash) : '', ...(area === 'center' || area === 'sides' ? this.blockers(p).filter((x) => x.uid !== uid).map((x) => this.name(x.uid)) : [])]
      const names = sc.alias.filter((n) => !taken.includes(n))
      const o = yield* this.ask(p, 'name', `Which name does ${this.def(uid).name} use this turn?`, (names.length ? names : sc.alias).map((n) => ({ t: 'name', label: n, w: 1 })), [uid])
      this.s.alias[uid] = o.label
    }
    if (!quiet) this.say(`${this.nm(p)} plays ${this.def(uid).name} into the ${area === 'center' ? 'Block Area (Center)' : area === 'sides' ? 'Block Area (Side)' : AREA_NAME[area]}.`, { t: 'enter', p, uid, area })
    // Rules about characters entering apply as the card arrives.
    for (const r of this.rule(p, 'enterMod')) {
      const areas = r.areas as string[] | undefined
      const block = area === 'center' || area === 'sides'
      if (areas && !(areas.includes(area) || (block && areas.includes('block')) || areas.includes('any'))) continue
      if (r.fromHand && from !== 'hand') continue
      const f = r.pred as ((g: HQ, uid: number) => boolean) | undefined
      if (f && !f(this, uid)) continue
      const k = r.param === 'area' ? AREA_PARAM[area] : (r.param as Param)
      if (r.fixTo != null) this.fix(uid, k, r.fixTo as number)
      else if (r.n) this.pump(uid, k, r.n as number)
      if (r.noReduce) this.noReduce(uid)
    }
    for (const r of this.rule(p, 'enterChoose')) {
      const f = r.pred as ((g: HQ, uid: number) => boolean) | undefined
      if (f && !f(this, uid)) continue
      const k = yield* this.pickParam(p, uid, `${r.src}: choose a parameter to get +${r.n}.`)
      if (k) this.pump(uid, k, r.n as number)
    }
    if (area === 'set') for (const r of this.rule(p, 'aPass')) this.pump(uid, 'st', r.n as number)
    if (area === 'center' || area === 'sides') {
      for (const r of this.rule(p, 'blockOut')) {
        const orig = this.def(uid).bl ?? 0
        if (orig <= (r.n as number)) {
          this.say(`Block Out: ${this.name(uid)} has an original Block Point of ${orig}.`)
          throw new LostSet(p, 'Block Out')
        }
      }
      for (const r of this.rule(p, 'sideToDrop')) {
        if (area === 'sides' && !this.s.once.includes(`${r.src}${r.turn}`)) {
          this.s.once.push(`${r.src}${r.turn}`)
          this.say(`${r.src}: the Side Blocker goes to the Drop Area.`)
          this.toDrop(uid)
          return true
        }
      }
      for (const r of this.rule(p, 'drawOnBlocker')) {
        if ((this.def(uid).bl ?? 0) >= (r.n as number)) this.draw(r.owner as Side, 1)
      }
    }
    // The card's own [Enter] skill and every skill that reacts to it wait together, and the
    // players choose the order they resolve in (rule 5-4).
    const own = sc.enter
    const zone = area === 'center' || area === 'sides' ? 'block' : area
    const waiting: Waiting[] = []
    if (own && (own.areas.includes('court') || own.areas.includes(zone as never) || own.areas.includes(area)) && !this.silenced(p, uid)) {
      waiting.push({ p, uid, label: `${this.name(uid)} (${AREA_NAME[area]})`, run: own.run(this, { p, uid, area, paid: [], seen: [], by }), still: () => this.areaOf(p, uid) != null })
    }
    waiting.push(...this.triggered({ t: 'enter', p, uid, area, entry }))
    if (defer) defer.push(...waiting)
    else yield* this.resolve(waiting)
    return true
  }
  /** Resolve skills that are waiting at the same time. The turn player resolves all of theirs first,
   *  choosing the order when there is more than one, then the other player does the same (rule 5-4-2).
   *  A skill whose card has left its place before its turn comes does not resolve (rule 6-6-3). */
  *resolve(list: Waiting[]): Gen {
    for (const side of [this.s.turn, opp(this.s.turn)] as Side[]) {
      let mine = list.filter((x) => x.p === side)
      while (mine.length) {
        let pick = mine[0]
        if (mine.length > 1) {
          const o = yield* this.ask(side, 'order', 'These skills trigger at the same time. Choose which one resolves first.',
            mine.map((x, i) => ({ t: 'order', n: i, label: x.label, w: mine.length - i })), mine.map((x) => x.uid))
          pick = mine[o.n!]
        }
        mine = mine.filter((x) => x !== pick)
        if (pick.still()) yield* pick.run
      }
    }
  }
  /** Let every card that reacts to something have its say. */
  *notify(e: Watch): Gen { yield* this.resolve(this.triggered(e)) }
  /** The skills that something just set off, waiting to resolve. */
  triggered(e: Watch): Waiting[] {
    const out: Waiting[] = []
    for (const side of [e.p, opp(e.p)] as Side[]) {
      const lookers = this.chars(side).map((c) => ({ uid: c.uid, area: c.area as Area | 'under' }))
      if (e.t === 'enter' && side === e.p && e.entry.onTop != null) lookers.push({ uid: e.entry.onTop, area: 'under' })
      for (const l of lookers) {
        if (l.uid === e.uid) continue
        const w = this.sc(l.uid).watch
        if (!w) continue
        if (l.area !== 'under' && this.silenced(side, l.uid)) continue
        const g = w(this, { p: side, uid: l.uid, area: l.area === 'under' ? undefined : l.area, paid: [], seen: [] }, e)
        if (!g) continue
        const here = l.area
        out.push({
          p: side, uid: l.uid, run: g,
          label: here === 'under' ? `${this.name(l.uid)} (under ${this.name(e.uid)})` : `${this.name(l.uid)} (${AREA_NAME[here]})`,
          still: () => (here === 'under' ? (['serve', 'center', 'receive', 'set', 'attack'] as Area[]).some((a) => this.P(side)[a].includes(l.uid)) : this.areaOf(side, l.uid) != null),
        })
      }
    }
    return out
  }

  // ---------- the match ----------
  private *run(): Gen {
    const s = this.s
    for (const p of [0, 1] as Side[]) this.shuffle(s.ps[p].deck)
    // A player chosen at random decides who takes the first right to serve (rule 4-2-1-2).
    const chooser: Side = this.rand() < 0.5 ? 0 : 1
    const serve = yield* this.ask(chooser, 'serve', 'You were picked at random. Do you want the first serve?', [{ t: 'serve', label: 'Serve first', w: 1 }, { t: 'give', label: 'Let my opponent serve', w: 0 }])
    s.serveRight = serve.t === 'serve' ? chooser : opp(chooser)
    this.say(`${this.nm(chooser)} ${serve.t === 'serve' ? 'takes' : 'gives up'} the first serve. ${this.nm(s.serveRight)} serves first.`)
    for (const p of [0, 1] as Side[]) this.draw(p, 6, true)
    // Each player may redraw once: put back any cards they choose, shuffle, and draw back up to 6 (rule 4-2-1-4).
    for (const p of [s.serveRight, opp(s.serveRight)]) {
      const o = yield* this.ask(p, 'mulligan', 'Keep this hand, or put some cards back and draw new ones? You can do this once.', [{ t: 'keep', label: 'Keep hand' }, { t: 'pick', label: 'Choose cards to put back' }, { t: 'mulligan', label: 'Put all 6 back' }])
      const P = s.ps[p]
      const back: number[] = []
      if (o.t === 'mulligan') back.push(...P.hand)
      else if (o.t === 'pick') {
        for (;;) {
          const left = P.hand.filter((u) => !back.includes(u))
          if (!left.length) break
          const opts: Opt[] = left.map((u) => ({ t: 'card', uid: u, label: this.name(u), w: this.worth(u) < 4 ? 2 : 0 }))
          opts.push({ t: 'no', label: back.length ? `Done, put back ${back.length}` : 'Done', w: 0.5 })
          const pick = yield* this.ask(p, 'pick', `Tap the cards to put back into your deck (${back.length} chosen).`, opts)
          if (pick.t !== 'card') break
          back.push(pick.uid!)
        }
      }
      if (back.length) {
        P.hand = P.hand.filter((u) => !back.includes(u))
        P.deck.push(...back)
        this.shuffle(P.deck)
        this.draw(p, 6 - P.hand.length, true)
        this.say(`${this.nm(p)} puts back ${back.length} card${back.length === 1 ? '' : 's'} and draws again.`)
      } else this.say(`${this.nm(p)} keeps.`)
    }
    for (const p of [0, 1] as Side[]) for (let i = 0; i < 2; i++) s.ps[p].score.push(s.ps[p].deck.pop()!)
    for (;;) {
      s.setNo++
      s.off = [null, null]
      s.offKind = ['', '']
      this.say(`Set ${s.setNo}. ${this.nm(s.serveRight)} serves.`, { t: 'set', p: s.serveRight })
      let p = s.serveRight
      try {
        yield* this.turn(p, true)
        for (;;) {
          p = opp(p)
          yield* this.turn(p, false)
        }
      } catch (e) {
        if (!(e instanceof LostSet)) throw e
        yield* this.lost(e.p, e.why)
      }
    }
  }

  private *turn(p: Side, serve: boolean): Gen {
    const s = this.s
    s.turn = p
    s.turnNo++
    s.turn1[p] = []
    s.def = null
    if (serve) {
      s.mode = 'serve'
      yield* this.servePhase(p)
    } else {
      s.phase = 'start'
      s.mode = null
      const canBlock = !this.hasRule(p, 'noBlock') && this.P(p).hand.some((u) => this.canEnter(p, u, 'center'))
      const opts: Opt[] = [{ t: 'receive', label: 'Receive' }]
      if (canBlock) opts.unshift({ t: 'block', label: 'Block' })
      const o = yield* this.ask(p, 'start', `${this.nm(opp(p))}'s Offense Point is ${s.off[opp(p)] ?? 0}. Block, or receive?`, opts)
      s.mode = o.t as 'block' | 'receive'
      this.say(`${this.nm(p)} chooses to ${o.t}.`, { t: 'choose', p })
      if (o.t === 'block') {
        const skipped = yield* this.blockPhase(p)
        if (skipped) yield* this.receiveTurn(p)
      } else yield* this.receiveTurn(p)
    }
    yield* this.endPhase(p)
  }

  private *servePhase(p: Side): Gen {
    const s = this.s
    s.phase = 'serve'
    this.say(`${this.nm(p)}'s Serve Phase.`, { t: 'phase', p })
    yield* this.enterStep(p, 'serve')
    yield* this.freeStep(p)
    const t = this.top(p, 'serve')!
    this.declareOff(p, (this.param(t, 'sv') ?? 0), 'Serve')
  }
  /** "Block Phase". Returns true when Deflection or a skill skipped ahead to the Draw Phase. */
  private *blockPhase(p: Side): Gen<boolean> {
    const s = this.s
    s.phase = 'block'
    this.say(`${this.nm(p)}'s Block Phase.`, { t: 'phase', p })
    let skip = false
    try {
      yield* this.blockEnter(p)
      yield* this.freeStep(p)
    } catch (e) {
      if (!(e instanceof SkipBlock)) throw e
      skip = true
    }
    if (!skip) {
      let def = 0
      const centerGone = this.hasRule(p, 'centerNoBlock')
      for (const c of this.blockers(p)) if (!(centerGone && c.area === 'center')) def += this.param(c.uid, 'bl') ?? 0
      s.def = def
      const off = s.off[opp(p)] ?? 0
      this.say(`Block: ${def} against an Offense Point of ${off}.`, { t: 'judge', p, n: def, win: def >= off })
      const failAt = this.rule(p, 'blockFailIf').map((r) => r.n as number)
      if (def < off || failAt.some((n) => def <= n)) throw new LostSet(p, 'The block failed.')
      this.say(`${this.nm(p)} blocks it!`, { t: 'blocked', p })
      this.declareOff(p, 0, 'Block')
      s.def = null
      for (const r of this.rule(p, 'stuffed')) {
        if (this.hasRule(p, 'noStuffed')) break
        this.addRule(p, 0, 'endOff', r.src, { n: r.n, label: 'Stuffed' })
      }
    }
    for (const uid of [...this.P(p).sides]) this.toDrop(uid, true)
    return skip
  }
  private *blockEnter(p: Side): Gen {
    const s = this.s
    const P = this.P(p)
    const max = Math.min(3, ...this.rule(p, 'blockMax').map((r) => r.n as number))
    const pickedNames: string[] = []
    const picked: number[] = []
    for (let i = 0; i < max; i++) {
      const pool = P.hand.filter((u) => !picked.includes(u) && this.canEnter(p, u, i === 0 ? 'center' : 'sides') && !pickedNames.includes(this.def(u).name))
      const opts: Opt[] = pool.map((u) => ({ t: 'enter', uid: u, area: (i === 0 ? 'center' : 'sides') as Area, label: i === 0 ? 'Play as Center Blocker' : 'Add as Side Blocker' }))
      if (i === 0) opts.push({ t: 'lost', label: 'Declare Lost' })
      else opts.push({ t: 'done', label: picked.length === 1 ? 'Block with one' : `Block with ${picked.length}` })
      if (opts.length === 1 && i === 0) throw new LostSet(p, 'No character can enter the Block Area.')
      const o = yield* this.ask(p, 'enter', i === 0 ? `Block Phase: choose your Center Blocker (offense ${s.off[opp(p)] ?? 0}).` : `Add a Side Blocker? (${picked.length} of ${max})`, opts)
      if (o.t === 'lost') throw new LostSet(p, 'Declared Lost.')
      if (o.t === 'done') break
      picked.push(o.uid!)
      pickedNames.push(this.def(o.uid!).name)
    }
    // All blockers enter together, then all of their skills wait and resolve together.
    const waiting: Waiting[] = []
    for (let i = 0; i < picked.length; i++) yield* this.enter(p, picked[i], i === 0 ? 'center' : 'sides', '', false, waiting)
    yield* this.resolve(waiting)
  }
  private *receiveTurn(p: Side): Gen {
    const s = this.s
    s.mode = 'receive'
    s.phase = 'draw'
    this.say(`${this.nm(p)}'s Draw Phase.`, { t: 'phase', p })
    if (this.hasRule(p, 'noDrawPhaseAdd')) this.say(`${this.nm(p)} cannot add cards to their hand during this Draw Phase.`)
    else this.draw(p, 1)
    yield* this.freeStep(p)

    s.phase = 'receive'
    this.say(`${this.nm(p)}'s Receive Phase.`, { t: 'phase', p })
    yield* this.enterStep(p, 'receive')
    yield* this.freeStep(p)
    const r = this.top(p, 'receive')!
    s.def = this.param(r, 'rc') ?? 0
    const off = s.off[opp(p)] ?? 0
    this.say(`Receive: ${s.def} against an Offense Point of ${off}.`, { t: 'judge', p, n: s.def, win: s.def >= off })
    if (s.def < off) throw new LostSet(p, 'The receive failed.')
    this.say(`${this.nm(p)} receives it!`, { t: 'received', p })
    s.def = null

    s.phase = 'set'
    this.say(`${this.nm(p)}'s Set Phase.`, { t: 'phase', p })
    try {
      yield* this.enterStep(p, 'set')
      yield* this.freeStep(p)
    } catch (e) {
      if (!(e instanceof SkipToEnd)) throw e
      return
    }

    s.phase = 'attack'
    this.say(`${this.nm(p)}'s Attack Phase.`, { t: 'phase', p })
    yield* this.enterStep(p, 'attack')
    yield* this.freeStep(p)
    const st = this.top(p, 'set')
    const at = this.top(p, 'attack')!
    this.declareOff(p, (st != null ? this.param(st, 'st') ?? 0 : 0) + (this.param(at, 'at') ?? 0) + this.offBonus(p), 'Attack')
  }
  private offBonus(p: Side) { return this.rule(p, 'offAdd').reduce((a, r) => a + (r.n as number), 0) }
  declareOff(p: Side, n: number, kind: string) {
    this.s.off[p] = n
    this.s.offKind[p] = kind
    this.say(`${this.nm(p)}'s ${kind} Offense Point: ${n}.`, { t: 'off', p, n })
  }
  private *enterStep(p: Side, area: 'serve' | 'receive' | 'set' | 'attack'): Gen {
    const P = this.P(p)
    const clash = area === 'set' ? this.top(p, 'receive') : area === 'attack' ? this.top(p, 'set') : null
    const pool = P.hand.filter((u) => this.canEnter(p, u, area) && (clash == null || this.def(u).name !== this.name(clash)))
    if (!pool.length) {
      this.say(`${this.nm(p)} has no character to play into the ${AREA_NAME[area]}.`)
      throw new LostSet(p, `No character could enter the ${AREA_NAME[area]}.`)
    }
    const opts: Opt[] = pool.map((u) => ({ t: 'enter', uid: u, area, label: `Play into the ${AREA_NAME[area]}` }))
    opts.push({ t: 'lost', label: 'Declare Lost' })
    const need = area === 'receive' ? ` (offense ${this.s.off[opp(p)] ?? 0})` : ''
    const o = yield* this.ask(p, 'enter', `Choose a character for the ${AREA_NAME[area]}${need}.`, opts)
    if (o.t === 'lost') throw new LostSet(p, 'Declared Lost.')
    yield* this.enter(p, o.uid!, area)
  }
  /** The Free Step: use Event cards and hand skills, declare Lost, or move on. */
  private *freeStep(p: Side): Gen {
    const s = this.s
    for (let guard = 0; guard < 30; guard++) {
      const P = this.P(p)
      const opts: Opt[] = []
      for (const uid of P.hand) {
        const d = this.def(uid)
        const sc = this.sc(uid)
        if (d.type === 'Event') {
          if (!sc.event || !sc.event.phases.includes(s.phase)) continue
          if (this.s.turn1[p].includes(d.name)) continue
          if (this.rule(p, 'noEvent').some((r) => (r.phases as Phase[]).some((ph) => this.timings(uid).includes(ph)))) continue
          if (sc.event.can && !sc.event.can(this, p)) continue
          opts.push({ t: 'event', uid, label: 'Play this Event' })
        } else if (sc.hand && sc.hand.phases.includes(s.phase)) {
          if (this.s.turn1[p].includes(d.name) || (s.phase === 'receive' && this.hasRule(p, 'noHandSkill'))) continue
          if (sc.hand.can && !sc.hand.can(this, p)) continue
          opts.push({ t: 'hand', uid, label: sc.hand.cost === 'discard' ? 'Discard to use its skill' : 'Send to the Event Area to use its skill' })
        }
      }
      if (!opts.length) return
      opts.push({ t: 'done', label: 'Continue' })
      opts.push({ t: 'lost', label: 'Declare Lost' })
      const o = yield* this.ask(p, 'free', `${PHASE_LABEL[s.phase]}: play an Event or skill, or continue.`, opts)
      if (o.t === 'done') return
      if (o.t === 'lost') throw new LostSet(p, 'Declared Lost.')
      if (o.t === 'event') yield* this.playEvent(p, o.uid!, true)
      else yield* this.useHand(p, o.uid!)
    }
  }
  *playEvent(p: Side, uid: number, fromHand: boolean): Gen {
    const sc = this.sc(uid)
    this.lift(uid)
    this.P(p).event.push(uid)
    this.say(`${this.nm(p)} plays ${this.def(uid).name}.`, { t: 'event', p, uid })
    if (sc.event) {
      if (this.rule(p, 'eventNoSkill').some((r) => (r.phases as Phase[]).some((ph) => this.timings(uid).includes(ph)))) this.say('Its skill cannot be used right now.')
      else yield* sc.event.run(this, { p, uid, paid: [], seen: [] })
      if (sc.event.turn1) this.s.turn1[p].push(this.def(uid).name)
    }
    yield* this.notify({ t: 'event', p, uid, fromHand })
  }
  private *useHand(p: Side, uid: number): Gen {
    const sc = this.sc(uid).hand!
    if (sc.cost === 'discard') { this.toDrop(uid, true); this.say(`${this.nm(p)} discards ${this.def(uid).name} to use its skill.`, { t: 'skill', p, uid }) }
    else if (sc.cost === 'none') this.say(`${this.nm(p)} uses the skill of ${this.def(uid).name}.`, { t: 'skill', p, uid })
    else { this.lift(uid); this.P(p).event.push(uid); this.say(`${this.nm(p)} sends ${this.def(uid).name} to the Event Area to use its skill.`, { t: 'skill', p, uid }) }
    yield* sc.run(this, { p, uid, paid: [], seen: [] })
    if (sc.turn1) this.s.turn1[p].push(this.def(uid).name)
  }
  private *endPhase(p: Side): Gen {
    const s = this.s
    s.phase = 'end'
    for (const r of this.rule(p, 'endOff')) {
      if (r.label === 'Stuffed' && this.hasRule(p, 'noStuffed')) continue
      this.say(`${r.label} (${r.n}): ${this.nm(p)}'s Offense Point becomes ${r.n}.`, { t: 'off', p, n: r.n as number })
      s.off[p] = r.n as number
    }
    // Cleanup Step: changes to numbers, chosen names and this turn's rules end.
    s.mods = {}
    s.alias = {}
    s.rules = s.rules.filter((r) => r.turn === -1 || r.turn > s.turnNo)
    s.def = null
  }
  private *lost(p: Side, why: string): Gen {
    const s = this.s
    const P = this.P(p)
    for (const uid of [...P.sides]) this.toDrop(uid, true)
    this.say(`${this.nm(p)} declares Lost. ${why}`, { t: 'lost', p })
    if (!P.score.length) throw new Over(opp(p), `${this.nm(p)} declared Lost with no Score cards left.`)
    s.sets[opp(p)]++
    // "When your opponent declares Lost" effects.
    for (const r of this.rule(p, 'onOppLost')) {
      const f = r.run as ((g: HQ) => Gen) | undefined
      if (f) yield* f(this)
    }
    s.rules = s.rules.filter((r) => r.turn === -2)
    s.mods = {}
    s.alias = {}
    s.phase = 'end'
    this.say(`Interval. ${this.nm(opp(p))} takes the set.`, { t: 'interval', p: opp(p) })
    for (const q of [s.turn, opp(s.turn)] as Side[]) {
      const need = 6 - this.P(q).hand.length
      if (need > 0) this.draw(q, need)
    }
    const sc = P.score.pop()!
    P.hand.push(sc)
    this.say(`${this.nm(p)} adds a Score card to their hand. ${P.score.length} left.`, { t: 'score', p })
    s.serveRight = opp(p)
  }
}

export const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Setup', serve: 'Serve Phase', start: 'Start Phase', block: 'Block Phase', draw: 'Draw Phase', receive: 'Receive Phase', set: 'Set Phase', attack: 'Attack Phase', end: 'End Phase', over: 'Match over',
}
