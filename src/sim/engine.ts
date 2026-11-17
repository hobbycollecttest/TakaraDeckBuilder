// HORO-BEAT rules engine. Follows the Comprehensive Rules, version 26.11.14.
//
// The whole game is one generator: it runs until it needs a decision, hands out a
// request with the legal options, and continues when it gets the answer. A match is
// fully described by its setup (seed and both decks) plus the list of answers, so a
// saved game is tiny and can be rebuilt anywhere by replaying those answers.
import raw from '../horobeat.json' with { type: 'json' }
import { SCRIPTS } from './scripts.js'

export type Side = 0 | 1
export type Color = 'Red' | 'Green' | 'Blue'
export type Def = {
  id: string; name: string; type: 'Horobeat' | 'Waza'; color: Color; cost: number; power: number; boost: number
  trigger: string; tribe: string; effect: string; triggerText: string; v?: number
}
type RawCard = { id: string; name: string; type: string; color: string; cost: number | null; power: number | null; boost: number | null; trigger: string; tribe: string; effect: string; triggerText: string; v?: number }
export const DEFS = new Map<string, Def>(
  (raw as RawCard[]).map((c) => [c.id, { ...c, type: c.type as Def['type'], color: c.color as Color, cost: c.cost ?? 0, power: c.power ?? 0, boost: c.boost ?? 0 }]),
)

export type Opt = { t: string; label: string; uid?: number; line?: number; side?: Side; via?: 'new' | 'over'; w?: number }
export type Req = { p: Side; kind: string; text: string; opts: Opt[]; show?: number[] }
export type Stack = { cards: number[]; down: boolean } // the last card is the top card
export type WazaCard = { uid: number; boost: boolean }
export type PlayerState = {
  deck: number[] // the last card is the top of the deck
  hand: number[]
  hearts: { uid: number; down: boolean }[] // the last card is the top Heart
  check: number[]
  grave: number[]
  ena: { uid: number; used: boolean }[]
  lines: (Stack | null)[]
  waza: WazaCard[][]
}
export type State = {
  ps: [PlayerState, PlayerState]
  cards: string[] // card id of every card in the match, by uid
  first: Side
  round: number
  phase: 'setup' | 'summon' | 'battle' | 'end' | 'over'
  active: Side
  line: number // the line being fought, or -1
  silenced: number[] // cards that lost their effects for the rest of the round
  winner: Side | null
  reason: string
}
/** What the table looks like at one moment, for drawing it. */
export type View = { ps: [PlayerState, PlayerState]; first: Side; round: number; phase: State['phase']; active: Side; line: number; pw: number[][]; dd: boolean[][] }
/** Something that just happened, with the table as it stood right after. The play screen animates these one by one. */
export type Ev = { t: string; text: string; p?: Side; line?: number; uid?: number; n?: number; broken?: number; winner?: Side | null; boost?: boolean; view: View }
type Fx = Omit<Ev, 'text' | 'view'>
export type Setup = { seed: number; decks: [string[], string[]]; names: [string, string] }
export type Gen<T = void> = Generator<Req, T, number>
type From = 'hand' | 'check' | 'effect'

// What a card's text does. Every hook is optional; a card with no text has no script.
export type Script = {
  power?: (g: Match, p: Side, line: number) => number
  dd?: boolean | ((g: Match, p: Side, line: number) => boolean)
  barrier?: number
  reflectBarrier?: boolean
  indestructible?: boolean
  noOverbeatOnto?: boolean
  noOverbeatFromHand?: boolean
  costMod?: number
  cantUseWaza?: boolean
  oppNoBoost?: boolean
  noPumpSelf?: boolean
  noPumpBoth?: boolean
  noDamageOnLose?: boolean
  toEnaOnDestroy?: boolean
  canPlay?: (g: Match, p: Side, line: number) => boolean
  onPlay?: (g: Match, p: Side, uid: number) => Gen
  onOverbeaten?: (g: Match, p: Side, line: number, wasDown: boolean, by: number) => Gen
  onBattleStart?: (g: Match, p: Side, line: number) => Gen
  onWin?: (g: Match, p: Side, line: number) => Gen
  onLose?: (g: Match, p: Side, line: number) => Gen
  onBattleEnd?: (g: Match, p: Side, line: number) => Gen
  onDowned?: (g: Match, p: Side, line: number) => Gen
  onDestroyed?: (g: Match, p: Side) => Gen
  onBoostUsed?: (g: Match, p: Side, line: number) => Gen
  onWazaUsed?: (g: Match, p: Side, line: number) => Gen
  onSummonEnd?: (g: Match, p: Side, line: number) => Gen
  wazaCanUse?: (g: Match, p: Side, line: number) => boolean
  wazaPower?: (g: Match, p: Side, line: number) => number
  wazaExtraDamage?: number
  wazaOnUse?: (g: Match, p: Side, line: number) => Gen
  wazaOnWin?: (g: Match, p: Side, line: number) => Gen
  wazaOnBattleEnd?: (g: Match, p: Side, line: number, uid: number) => Gen
}
const NONE: Script = {}

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

export class Match {
  s: State
  req: Req | null = null
  log: { round: number; text: string }[] = []
  answers: number[] = []
  /** Turn on to keep a step-by-step record for animation. Off for tests and replays. */
  record = false
  events: Ev[] = []
  private gen: Gen
  private rand: () => number
  private line1: Side | null = null

  constructor(public setup: Setup) {
    this.rand = mulberry32(setup.seed)
    const cards: string[] = []
    const mk = (ids: string[]): PlayerState => ({
      deck: ids.map((id) => cards.push(id) - 1),
      hand: [], hearts: [], check: [], grave: [], ena: [],
      lines: [null, null, null, null, null],
      waza: [[], [], [], [], []],
    })
    const a = mk(setup.decks[0])
    const b = mk(setup.decks[1])
    this.s = { ps: [a, b], cards, first: 0, round: 0, phase: 'setup', active: 0, line: -1, silenced: [], winner: null, reason: '' }
    this.gen = this.run()
    this.step()
  }

  static replay(setup: Setup, answers: number[]) {
    const m = new Match(setup)
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
      this.s.winner = e.winner
      this.s.reason = e.reason
      this.s.phase = 'over'
      this.s.line = -1
      this.req = null
      this.say(`${this.nm(e.winner)} wins. ${e.reason}`, { t: 'victory', p: e.winner })
    }
  }

  // ---------- reading the table ----------
  P(p: Side) { return this.s.ps[p] }
  nm(p: Side) { return this.setup.names[p] }
  def(uid: number) { return DEFS.get(this.s.cards[uid])! }
  name(uid: number) { return this.def(uid).name }
  /** The card's script, ignoring whether it has lost its effects. */
  rawScript(uid: number): Script { return SCRIPTS[this.def(uid).name] || NONE }
  /** The card's script, or nothing if it lost its effects this round. */
  sc(uid: number): Script { return this.s.silenced.includes(uid) ? NONE : this.rawScript(uid) }
  top(p: Side, line: number): number | null {
    const st = this.P(p).lines[line]
    return st ? st.cards[st.cards.length - 1] : null
  }
  /** Where a card is, if it is the top card of one of its player's lines. */
  where(p: Side, uid: number): number {
    return this.P(p).lines.findIndex((st) => !!st && st.cards[st.cards.length - 1] === uid)
  }
  under(p: Side, line: number) {
    const st = this.P(p).lines[line]
    return st ? st.cards.length - 1 : 0
  }
  isDown(p: Side, line: number) { return !!this.P(p).lines[line]?.down }
  countH(p: Side, pred?: (d: Def) => boolean) {
    return this.P(p).lines.filter((st) => st && (!pred || pred(this.def(st.cards[st.cards.length - 1])))).length
  }
  enaCount(p: Side, color?: Color) {
    return this.P(p).ena.filter((e) => !color || this.def(e.uid).color === color).length
  }
  unused(p: Side) { return this.P(p).ena.filter((e) => !e.used).length }
  hasTribe(p: Side, line: number, tribe: string) {
    const t = this.top(p, line)
    return t != null && this.def(t).tribe.includes(tribe)
  }
  usingWaza(p: Side, line: number) { return this.P(p).waza[line].some((w) => !w.boost) }
  wazaCount(p: Side, line: number) { return this.P(p).waza[line].filter((w) => !w.boost).length }
  boosted(p: Side, line: number) { return this.P(p).waza[line].some((w) => w.boost) }
  costInLine(uid: number) { return Math.max(0, this.def(uid).cost + (this.sc(uid).costMod || 0)) }
  firstEmpty(p: Side) { return this.P(p).lines.findIndex((st) => !st) }

  private pumpLocked(p: Side, line: number) {
    const mine = this.top(p, line)
    const theirs = this.top((1 - p) as Side, line)
    if (mine != null && (this.sc(mine).noPumpSelf || this.sc(mine).noPumpBoth)) return true
    return theirs != null && !!this.sc(theirs).noPumpBoth
  }
  power(p: Side, line: number): number {
    const t = this.top(p, line)
    if (t == null) return 0
    let v = this.def(t).power + (this.sc(t).power?.(this, p, line) || 0)
    if (!this.pumpLocked(p, line)) {
      for (const w of this.P(p).waza[line]) {
        const d = this.def(w.uid)
        v += w.boost ? d.boost : d.power + (this.rawScript(w.uid).wazaPower?.(this, p, line) || 0)
      }
    }
    return Math.max(0, v)
  }
  hasDD(p: Side, line: number) {
    const t = this.top(p, line)
    if (t == null) return false
    const dd = this.sc(t).dd
    return typeof dd === 'function' ? dd(this, p, line) : !!dd
  }

  // ---------- small actions ----------
  snapshot(): View {
    const s = this.s
    const lines = [0, 1, 2, 3, 4]
    return {
      ps: JSON.parse(JSON.stringify(s.ps)), first: s.first, round: s.round, phase: s.phase, active: s.active, line: s.line,
      pw: ([0, 1] as Side[]).map((p) => lines.map((l) => this.power(p, l))),
      dd: ([0, 1] as Side[]).map((p) => lines.map((l) => this.hasDD(p, l))),
    }
  }
  say(text: string, fx: Fx = { t: 'note' }) {
    // The person at the table is called "You", so the grammar is fixed up to match.
    if (this.setup.names.includes('You')) {
      text = text
        .replace(/\bYou's\b/g, 'your')
        .replace(/\bYou (has|is|goes|[A-Za-z]+s)\b/g, (_m, v: string) => `You ${v === 'has' ? 'have' : v === 'is' ? 'are' : v === 'goes' ? 'go' : v.slice(0, -1)}`)
        .replace(/^your/, 'Your')
    }
    this.log.push({ round: this.s.round, text })
    if (this.record) this.events.push({ ...fx, text, view: this.snapshot() })
  }
  private shuffle(list: number[]) {
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
    return got
  }
  recover(p: Side, line: number) {
    const st = this.P(p).lines[line]
    if (st && st.down) {
      st.down = false
      this.say(`${this.name(this.top(p, line)!)} recovers.`, { t: 'recover', p, line })
    }
  }
  /** Stand up to n used Ena back up, preferring one color if given. */
  freeEna(p: Side, n: number, color?: Color) {
    let done = 0
    for (const e of this.P(p).ena) {
      if (done >= n) break
      if (e.used && (!color || this.def(e.uid).color === color)) { e.used = false; done++ }
    }
    if (done) this.say(`${this.nm(p)} returns ${done} Ena to unused.`, { t: 'ena', p })
    return done
  }
  deckToEna(p: Side) {
    const P = this.P(p)
    if (!P.deck.length) return
    const uid = P.deck.pop()!
    P.ena.push({ uid, used: true })
    this.say(`${this.nm(p)} puts ${this.name(uid)} from the deck into Ena, used.`, { t: 'ena', p })
  }
  discard(p: Side, uid: number) {
    const P = this.P(p)
    P.hand.splice(P.hand.indexOf(uid), 1)
    P.grave.push(uid)
    this.say(`${this.nm(p)} discards ${this.name(uid)}.`)
  }
  silence(uid: number) { if (!this.s.silenced.includes(uid)) this.s.silenced.push(uid) }
  swap(p: Side, a: number, b: number) {
    const L = this.P(p).lines
    ;[L[a], L[b]] = [L[b], L[a]]
  }
  /** Return the top card of a line to its owner's hand. Cards under it stay. */
  bounceTop(p: Side, line: number) {
    const st = this.P(p).lines[line]
    if (!st) return
    const uid = st.cards.pop()!
    this.P(p).hand.push(uid)
    if (!st.cards.length) this.P(p).lines[line] = null
    this.say(`${this.name(uid)} returns to ${this.nm(p)}'s hand.`)
  }

  *ask(p: Side, kind: string, text: string, opts: Opt[], show?: number[]): Gen<Opt> {
    if (!opts.length) throw new Error(`No options for ${kind}`)
    const i = yield { p, kind, text, opts, show }
    return opts[i]
  }
  *yesNo(p: Side, text: string, w = 1, show?: number[]): Gen<boolean> {
    const o = yield* this.ask(p, 'confirm', text, [{ t: 'yes', label: 'Yes', w }, { t: 'no', label: 'No', w: 0 }], show)
    return o.t === 'yes'
  }
  /** Pick one of a player's lines. `weight` tells the CPU which choice is usually best. */
  *pickLine(asker: Side, side: Side, text: string, lines: number[], optional: boolean, weight?: (line: number) => number): Gen<number | null> {
    if (!lines.length) return null
    const opts: Opt[] = lines.map((line) => ({ t: 'stack', side, line, label: `${this.name(this.top(side, line)!)} (Line ${line + 1})`, w: weight ? weight(line) : 1 }))
    if (optional) opts.push({ t: 'no', label: "Don't", w: 0.5 })
    const o = yield* this.ask(asker, 'pick', text, opts)
    return o.t === 'stack' ? o.line! : null
  }
  *pickCard(p: Side, text: string, uids: number[], optional: boolean, weight?: (uid: number) => number, show?: number[]): Gen<number | null> {
    if (!uids.length) return null
    const opts: Opt[] = uids.map((uid) => ({ t: 'card', uid, label: this.name(uid), w: weight ? weight(uid) : 1 }))
    if (optional) opts.push({ t: 'no', label: "Don't", w: 0.5 })
    const o = yield* this.ask(p, 'pick', text, opts, show)
    return o.t === 'card' ? o.uid! : null
  }

  // ---------- paying ----------
  canPay(p: Side, n: number, color: Color, colorCovered: boolean) {
    const free = this.P(p).ena.filter((e) => !e.used)
    if (free.length < n) return false
    // The card's color must be among the Ena paid, unless the Overbeat base already covers it.
    return colorCovered || (n > 0 && free.some((e) => this.def(e.uid).color === color))
  }
  private pay(p: Side, n: number, color: Color, colorCovered: boolean) {
    const free = this.P(p).ena.filter((e) => !e.used)
    const chosen: typeof free = []
    if (!colorCovered && n > 0) chosen.push(free.find((e) => this.def(e.uid).color === color)!)
    // Spend the color you have the most of first, so the rarer colors stay open.
    const count = (c: Color) => free.filter((e) => this.def(e.uid).color === c && !chosen.includes(e)).length
    while (chosen.length < n) {
      const rest = free.filter((e) => !chosen.includes(e))
      rest.sort((x, y) => count(this.def(y.uid).color) - count(this.def(x.uid).color))
      chosen.push(rest[0])
    }
    for (const e of chosen) e.used = true
  }

  // ---------- playing Horobeat ----------
  private meetsCondition(p: Side, uid: number, line: number) {
    const f = this.rawScript(uid).canPlay
    return !f || f(this, p, line)
  }
  private canOverbeat(p: Side, uid: number, line: number, from: From) {
    const base = this.top(p, line)
    if (base == null) return false
    if (this.sc(base).noOverbeatOnto) return false
    if (from === 'hand' && this.rawScript(uid).noOverbeatFromHand) return false
    if (this.costInLine(base) >= this.def(uid).cost) return false
    return this.meetsCondition(p, uid, line)
  }
  /** Where a Horobeat could go without paying: a new line, or onto your own Horobeat. */
  freeSpots(p: Side, uid: number, from: From, allowNew: boolean): { via: 'new' | 'over'; line: number }[] {
    const out: { via: 'new' | 'over'; line: number }[] = []
    const e = this.firstEmpty(p)
    if (allowNew && e >= 0 && this.meetsCondition(p, uid, e)) out.push({ via: 'new', line: e })
    for (let line = 0; line < 5; line++) if (this.canOverbeat(p, uid, line, from)) out.push({ via: 'over', line })
    return out
  }
  playLabel(uid: number, via: 'new' | 'over', line: number, p: Side, cost?: number) {
    const pay = cost == null ? '' : ` (pay ${cost})`
    return via === 'new' ? `Play to Line ${line + 1}${pay}` : `Overbeat ${this.name(this.top(p, line)!)} on Line ${line + 1}${pay}`
  }
  *enter(p: Side, uid: number, via: 'new' | 'over', line: number): Gen {
    const P = this.P(p)
    if (via === 'new') {
      P.lines[line] = { cards: [uid], down: false }
      this.say(`${this.nm(p)} plays ${this.name(uid)} to Line ${line + 1}.`, { t: 'summon', p, line, uid })
      const f = this.sc(uid).onPlay
      if (f) yield* f(this, p, uid)
      return
    }
    const st = P.lines[line]!
    const base = st.cards[st.cards.length - 1]
    const wasDown = st.down
    st.cards.push(uid)
    st.down = false
    this.say(`${this.nm(p)} Overbeats ${this.name(base)} with ${this.name(uid)} on Line ${line + 1}.`, { t: 'summon', p, line, uid })
    const f = this.sc(uid).onPlay
    if (f) yield* f(this, p, uid)
    const g = this.sc(base).onOverbeaten
    if (g) yield* g(this, p, line, wasDown, uid)
  }
  /** Let a player put a Horobeat from their hand into play for free, if they want to. */
  *offerFreePlay(p: Side, text: string, uids: number[]): Gen<boolean> {
    const opts: Opt[] = []
    for (const uid of uids) for (const s of this.freeSpots(p, uid, 'effect', true)) opts.push({ t: 'play', uid, via: s.via, line: s.line, label: `${this.name(uid)}: ${this.playLabel(uid, s.via, s.line, p)}`, w: s.via === 'new' ? 2 : 1 })
    if (!opts.length) return false
    opts.push({ t: 'no', label: "Don't", w: 0 })
    const o = yield* this.ask(p, 'pick', text, opts)
    if (o.t !== 'play') return false
    const P = this.P(p)
    P.hand.splice(P.hand.indexOf(o.uid!), 1)
    yield* this.enter(p, o.uid!, o.via!, o.line!)
    return true
  }

  // ---------- damage ----------
  *damageHorobeat(p: Side, line: number): Gen {
    const st = this.P(p).lines[line]
    if (!st) return
    const uid = st.cards[st.cards.length - 1]
    if (st.down) {
      if (this.sc(uid).indestructible) this.say(`${this.name(uid)} cannot be destroyed and stays downed.`)
      else yield* this.destroy(p, line)
      return
    }
    st.down = true
    this.say(`${this.name(uid)} is downed.`, { t: 'down', p, line })
    const f = this.sc(uid).onDowned
    if (f) yield* f(this, p, line)
  }
  *destroy(p: Side, line: number): Gen {
    const P = this.P(p)
    const st = P.lines[line]
    if (!st) return
    const uid = st.cards[st.cards.length - 1]
    const sc = this.sc(uid)
    P.lines[line] = null
    P.grave.push(...st.cards.slice(0, -1))
    if (sc.toEnaOnDestroy) {
      P.ena.push({ uid, used: false })
      this.say(`${this.name(uid)} is destroyed and goes to Ena instead of the Graveyard.`, { t: 'destroy', p, line, uid })
    } else {
      P.grave.push(uid)
      this.say(`${this.name(uid)} is destroyed.`, { t: 'destroy', p, line, uid })
    }
    if (sc.onDestroyed) yield* sc.onDestroyed(this, p)
  }
  *damagePlayer(p: Side, n: number, cannotFinish: boolean): Gen {
    if (n <= 0) return
    const P = this.P(p)
    if (!P.hearts.length) {
      if (cannotFinish) return
      throw new Over((1 - p) as Side, 'Finishing Blow.')
    }
    let broken = 0
    for (let i = 0; i < n && P.hearts.length; i++) {
      const h = P.hearts[P.hearts.length - 1]
      if (h.down) {
        P.hearts.pop()
        P.check.push(h.uid)
        broken++
      } else h.down = true
    }
    this.say(`${this.nm(p)} takes ${n} damage. ${broken ? `${broken} Heart${broken === 1 ? '' : 's'} destroyed, ` : ''}${P.hearts.length} Heart${P.hearts.length === 1 ? '' : 's'} left.`, { t: 'damage', p, n, broken })
    yield* this.checkProcess(p)
  }
  private *checkProcess(p: Side): Gen {
    const P = this.P(p)
    while (P.check.length) {
      const opts: Opt[] = []
      for (const uid of P.check) {
        const d = this.def(uid)
        if (d.trigger === 'Draw Trigger') opts.push({ t: 'trig-draw', uid, label: `${d.name}: Draw Trigger (draw 3)`, w: 5 })
        else if (d.trigger === 'Last Over Trigger') opts.push({ t: 'trig-last', uid, label: `${d.name}: Last Over Trigger`, w: 4 })
        else if (d.trigger === 'Entry Trigger' || d.trigger === 'Over Trigger') {
          for (const s of this.freeSpots(p, uid, 'check', d.trigger === 'Entry Trigger')) {
            const w = s.via === 'new' ? 7 : this.isDown(p, s.line) ? 8 : 3 + (d.power - this.def(this.top(p, s.line)!).power) / 4000
            opts.push({ t: 'trig-play', uid, via: s.via, line: s.line, label: `${d.name}: ${this.playLabel(uid, s.via, s.line, p)}`, w })
          }
        }
      }
      opts.push({ t: 'take', label: P.check.length > 1 ? 'Add them to your hand' : 'Add it to your hand', w: 1 })
      const o = yield* this.ask(p, 'check', 'A Heart was destroyed. Use a Trigger?', opts, [...P.check])
      if (o.t === 'take') {
        P.hand.push(...P.check)
        P.check = []
        return
      }
      const uid = o.uid!
      P.check.splice(P.check.indexOf(uid), 1)
      if (o.t === 'trig-draw') {
        P.grave.push(uid)
        this.say(`${this.nm(p)} reveals ${this.name(uid)}: Draw Trigger.`, { t: 'trigger', p, uid })
        this.draw(p, 3)
      } else if (o.t === 'trig-play') {
        this.say(`${this.nm(p)} reveals ${this.name(uid)}: ${this.def(uid).trigger}.`, { t: 'trigger', p, uid })
        yield* this.enter(p, uid, o.via!, o.line!)
      } else {
        P.hand.push(uid)
        this.say(`${this.nm(p)} reveals ${this.name(uid)}: Last Over Trigger.`, { t: 'trigger', p, uid })
        this.draw(p, 1)
        if (P.hearts.length <= 1) {
          const spots = this.freeSpots(p, uid, 'check', false)
          if (spots.length) {
            const opts2: Opt[] = spots.map((s) => ({ t: 'play', uid, via: s.via, line: s.line, label: this.playLabel(uid, s.via, s.line, p), w: this.isDown(p, s.line) ? 3 : 2 }))
            opts2.push({ t: 'no', label: 'Keep it in hand', w: 0 })
            const o2 = yield* this.ask(p, 'pick', `Play ${this.name(uid)} with Overbeat for free?`, opts2, [uid])
            if (o2.t === 'play') {
              P.hand.splice(P.hand.indexOf(uid), 1)
              yield* this.enter(p, uid, 'over', o2.line!)
            }
          }
        }
      }
    }
  }

  // ---------- Waza and Boost ----------
  canUseWaza(p: Side, uid: number, line: number) {
    const t = this.top(p, line)
    if (t == null || this.sc(t).cantUseWaza) return false
    const f = this.rawScript(uid).wazaCanUse
    return !f || f(this, p, line)
  }
  /** Put a Waza into a line's Waza Zone and resolve its "when used" effects. */
  *useWaza(p: Side, uid: number, line: number): Gen {
    this.P(p).waza[line].push({ uid, boost: false })
    this.say(`${this.nm(p)} uses ${this.name(uid)} on Line ${line + 1}.`, { t: 'waza', p, line, uid })
    const f = this.rawScript(uid).wazaOnUse
    if (f) yield* f(this, p, line)
    const t = this.top(p, line)
    const g = t != null ? this.sc(t).onWazaUsed : undefined
    if (g) yield* g(this, p, line)
  }
  private battleOpts(p: Side, line: number): Opt[] {
    const P = this.P(p)
    const mine = this.top(p, line)
    if (mine == null) return []
    const theirs = this.top((1 - p) as Side, line)
    const noBoost = theirs != null && !!this.sc(theirs).oppNoBoost
    const opts: Opt[] = []
    for (const uid of P.hand) {
      const d = this.def(uid)
      if (d.type === 'Waza') {
        if (this.canUseWaza(p, uid, line) && this.canPay(p, d.cost, d.color, false)) opts.push({ t: 'waza', uid, label: `Use ${d.name} (pay ${d.cost})` })
      } else if (d.boost && !noBoost && this.canPay(p, 1, d.color, false)) opts.push({ t: 'boost', uid, label: `Boost with ${d.name} (pay 1)` })
    }
    return opts
  }

  // ---------- the game ----------
  private order(): Side[] { return [this.s.first, (1 - this.s.first) as Side] }

  private *run(): Gen {
    const s = this.s
    for (const p of [0, 1] as Side[]) this.shuffle(s.ps[p].deck)
    s.first = this.rand() < 0.5 ? 0 : 1
    this.say(`${this.nm(s.first)} goes first.`)
    for (const p of [0, 1] as Side[]) this.draw(p, 6, true)
    for (const p of this.order()) {
      const o = yield* this.ask(p, 'mulligan', 'Keep this hand, or redraw all 6 cards once?', [{ t: 'keep', label: 'Keep' }, { t: 'mulligan', label: 'Redraw' }])
      if (o.t === 'mulligan') {
        const P = s.ps[p]
        P.deck.push(...P.hand)
        P.hand = []
        this.shuffle(P.deck)
        this.draw(p, 6, true)
        this.say(`${this.nm(p)} redraws.`)
      } else this.say(`${this.nm(p)} keeps.`)
    }
    for (const p of [0, 1] as Side[]) {
      const P = s.ps[p]
      for (let i = 0; i < 5; i++) P.hearts.push({ uid: P.deck.pop()!, down: false })
      P.ena.push({ uid: P.deck.pop()!, used: false })
    }
    for (;;) {
      s.round++
      s.phase = 'summon'
      s.active = s.first
      this.say(`Round ${s.round}. ${this.nm(s.first)} is the First Player.`, { t: 'round', p: s.first })
      yield* this.summonPhase()
      yield* this.battlePhase()
      this.endPhase()
    }
  }

  private *summonPhase(): Gen {
    const s = this.s
    s.phase = 'summon'
    for (const p of this.order()) {
      const P = s.ps[p]
      s.active = p
      this.say(`${this.nm(p)}'s Summon Phase.`, { t: 'phase', p })
      if (s.round > 1) {
        if (!P.deck.length) throw new Over((1 - p) as Side, `${this.nm(p)} has no cards left to draw.`)
        this.draw(p, 1)
      }
      if (P.hand.length) {
        const opts: Opt[] = P.hand.map((uid) => ({ t: 'charge', uid, label: 'Put into Ena' }))
        opts.push({ t: 'skip', label: 'Skip Ena Charge' })
        const o = yield* this.ask(p, 'charge', 'Ena Charge: put 1 card from your hand into Ena, or skip.', opts)
        if (o.t === 'charge') {
          P.hand.splice(P.hand.indexOf(o.uid!), 1)
          P.ena.push({ uid: o.uid!, used: false })
          this.say(`${this.nm(p)} charges ${this.name(o.uid!)} as Ena.`, { t: 'charge', p, uid: o.uid! })
        }
      }
      for (;;) {
        const opts: Opt[] = []
        for (const uid of P.hand) {
          const d = this.def(uid)
          if (d.type !== 'Horobeat') continue
          const e = this.firstEmpty(p)
          if (e >= 0 && this.meetsCondition(p, uid, e) && this.canPay(p, d.cost, d.color, false)) opts.push({ t: 'play', uid, via: 'new', line: e, label: this.playLabel(uid, 'new', e, p, d.cost) })
          for (let line = 0; line < 5; line++) {
            if (!this.canOverbeat(p, uid, line, 'hand')) continue
            const base = this.top(p, line)!
            const cost = Math.max(0, d.cost - this.costInLine(base))
            const covered = this.def(base).color === d.color
            if (this.canPay(p, cost, d.color, covered)) opts.push({ t: 'play', uid, via: 'over', line, label: this.playLabel(uid, 'over', line, p, cost) })
          }
        }
        if (!opts.length) break
        opts.push({ t: 'end', label: 'End Summon Phase' })
        const o = yield* this.ask(p, 'main', 'Summon Phase: play Horobeat from your hand, or end.', opts)
        if (o.t === 'end') break
        const d = this.def(o.uid!)
        P.hand.splice(P.hand.indexOf(o.uid!), 1)
        if (o.via === 'new') this.pay(p, d.cost, d.color, false)
        else {
          const base = this.top(p, o.line!)!
          this.pay(p, Math.max(0, d.cost - this.costInLine(base)), d.color, this.def(base).color === d.color)
        }
        yield* this.enter(p, o.uid!, o.via!, o.line!)
      }
      for (let line = 0; line < 5; line++) {
        const t = this.top(p, line)
        const f = t != null ? this.sc(t).onSummonEnd : undefined
        if (f) yield* f(this, p, line)
      }
    }
  }

  private *battlePhase(): Gen {
    const s = this.s
    s.phase = 'battle'
    this.line1 = null
    this.say('Battle Phase.', { t: 'phase' })
    for (let line = 0; line < 5; line++) {
      if (!s.ps[0].lines[line] && !s.ps[1].lines[line]) continue
      yield* this.lineBattle(line)
    }
    s.line = -1
  }

  private *lineBattle(line: number): Gen {
    const s = this.s
    s.line = line
    this.say(`Line ${line + 1} battle.`, { t: 'line', line })
    for (const p of this.order()) {
      const t = this.top(p, line)
      const f = t != null ? this.sc(t).onBattleStart : undefined
      if (f) yield* f(this, p, line)
    }
    // Players take turns using Waza or Boosts until both pass in a row.
    let passes = 0
    let turn = s.first
    while (passes < 2) {
      s.active = turn
      const opts = this.battleOpts(turn, line)
      if (!opts.length) passes++
      else {
        opts.push({ t: 'pass', label: 'Pass' })
        const o = yield* this.ask(turn, 'battle', `Line ${line + 1} battle: use a Waza or Boost, or pass.`, opts)
        if (o.t === 'pass') passes++
        else {
          passes = 0
          const P = s.ps[turn]
          const d = this.def(o.uid!)
          P.hand.splice(P.hand.indexOf(o.uid!), 1)
          if (o.t === 'waza') {
            this.pay(turn, d.cost, d.color, false)
            yield* this.useWaza(turn, o.uid!, line)
          } else {
            this.pay(turn, 1, d.color, false)
            P.waza[line].push({ uid: o.uid!, boost: true })
            this.say(`${this.nm(turn)} Boosts with ${d.name} on Line ${line + 1}.`, { t: 'waza', p: turn, line, uid: o.uid!, boost: true })
            const t = this.top(turn, line)
            const f = t != null ? this.sc(t).onBoostUsed : undefined
            if (f) yield* f(this, turn, line)
          }
        }
      }
      turn = (1 - turn) as Side
    }

    const fighters = [this.top(0, line), this.top(1, line)]
    const still = (p: Side) => fighters[p] != null && this.top(p, line) === fighters[p]
    let winner: Side | null = null
    let fought = true
    if (fighters[0] != null && fighters[1] != null) {
      const a = this.power(0, line)
      const b = this.power(1, line)
      winner = a > b ? 0 : b > a ? 1 : null
      this.say(`Line ${line + 1}: ${this.name(fighters[0])} ${a} vs ${this.name(fighters[1])} ${b}. ${winner == null ? 'Draw.' : `${this.nm(winner)} wins the battle.`}`, { t: 'clash', line, winner })
    } else if (fighters[0] != null || fighters[1] != null) {
      winner = fighters[0] != null ? 0 : 1
      this.say(`Line ${line + 1}: ${this.name(fighters[winner]!)} wins with no one across from it.`, { t: 'clash', line, winner })
    } else fought = false
    if (line === 0) this.line1 = fought ? winner : null

    if (winner != null) {
      const w = winner
      const l = (1 - w) as Side
      if (still(w)) {
        const f = this.sc(fighters[w]!).onWin
        if (f) yield* f(this, w, line)
        for (const z of [...s.ps[w].waza[line]]) {
          const g = z.boost ? undefined : this.rawScript(z.uid).wazaOnWin
          if (g) yield* g(this, w, line)
        }
      }
      let dmg = this.hasDD(w, line) ? 2 : 1
      for (const z of s.ps[w].waza[line]) if (!z.boost) dmg += this.rawScript(z.uid).wazaExtraDamage || 0
      let spared = false
      if (still(l)) {
        const sc = this.sc(fighters[l]!)
        if (sc.barrier) {
          const cut = Math.min(sc.barrier, dmg)
          dmg -= cut
          this.say(`${this.name(fighters[l]!)}'s Barrier reduces the damage by ${cut}.`)
          if (sc.reflectBarrier && cut > 0) yield* this.damagePlayer(w, cut, true)
        }
        if (sc.noDamageOnLose) spared = true
        if (sc.onLose) yield* sc.onLose(this, l, line)
      }
      if (!spared) yield* this.damageHorobeat(l, line)
      yield* this.damagePlayer(l, dmg, false)
    } else if (fought) {
      for (const p of this.order()) yield* this.damageHorobeat(p, line)
    }

    for (const p of this.order()) {
      if (!still(p)) continue
      const f = this.sc(fighters[p]!).onBattleEnd
      if (f) yield* f(this, p, line)
    }
    for (const p of this.order()) {
      for (const z of [...s.ps[p].waza[line]]) {
        const g = z.boost ? undefined : this.rawScript(z.uid).wazaOnBattleEnd
        if (g && s.ps[p].waza[line].includes(z)) yield* g(this, p, line, z.uid)
      }
    }
    for (const p of [0, 1] as Side[]) {
      s.ps[p].grave.push(...s.ps[p].waza[line].map((z) => z.uid))
      s.ps[p].waza[line] = []
    }
  }

  private endPhase() {
    const s = this.s
    s.phase = 'end'
    s.line = -1
    s.silenced = []
    this.say('End Phase.', { t: 'phase' })
    s.first = this.line1 != null ? this.line1 : ((1 - s.first) as Side)
    for (const p of [0, 1] as Side[]) {
      const P = s.ps[p]
      const kept = P.lines.filter((st) => st)
      P.lines = [...kept, ...Array(5 - kept.length).fill(null)]
    }
    for (const p of this.order()) {
      const n = this.unused(p)
      if (n) {
        const got = this.draw(p, n, true)
        if (got) this.say(`Ena Draw: ${this.nm(p)} draws ${got}.`, { t: 'draw', p, n: got })
      }
    }
    for (const p of [0, 1] as Side[]) for (const e of s.ps[p].ena) e.used = false
    this.say('All Ena return to unused.', { t: 'refresh' })
  }
}
