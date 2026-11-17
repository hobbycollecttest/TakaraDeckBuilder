// Spot checks of specific rules, set up by hand. Run with: npx tsx scripts/sim-rules.ts
import { DEFS, Match, type Side } from '../src/sim/engine'

const one = [...new Map([...DEFS.values()].map((d) => [d.name, d.id])).values()]
const deck = Array.from({ length: 10 }, () => one).flat()
let passed = 0
function ok(cond: boolean, what: string) {
  if (!cond) throw new Error(`FAILED: ${what}`)
  passed++
}
class T {
  m: Match
  constructor(first: Side = 0) {
    let seed = 1
    for (;;) { this.m = new Match({ seed: seed++, decks: [deck, deck], names: ['A', 'B'] }); if (this.m.s.first === first) break }
    this.pick('keep'); this.pick('keep')
    for (const p of [0, 1] as Side[]) { const P = this.m.P(p); P.deck.push(...P.hand, ...P.ena.map((e) => e.uid)); P.hand = []; P.ena = [] }
  }
  private take(p: Side, name: string) {
    const P = this.m.P(p)
    const i = P.deck.findIndex((u) => this.m.name(u) === name)
    if (i < 0) throw new Error(`no ${name} in deck`)
    return P.deck.splice(i, 1)[0]
  }
  hand(p: Side, ...names: string[]) { for (const n of names) this.m.P(p).hand.push(this.take(p, n)); return this }
  ena(p: Side, ...names: string[]) { for (const n of names) this.m.P(p).ena.push({ uid: this.take(p, n), used: false }); return this }
  line(p: Side, line: number, name: string, down = false, under: string[] = []) {
    this.m.P(p).lines[line] = { cards: [...under.map((n) => this.take(p, n)), this.take(p, name)], down }
    return this
  }
  hearts(p: Side, n: number, topDown = false) {
    const P = this.m.P(p)
    while (P.hearts.length > n) P.deck.push(P.hearts.pop()!.uid)
    if (P.hearts.length) P.hearts[P.hearts.length - 1].down = topDown
    return this
  }
  heartTop(p: Side, name: string, down = true) { this.m.P(p).hearts.push({ uid: this.take(p, name), down }); return this }
  opts() { return this.m.req!.opts.map((o) => o.label) }
  /** Answer the current request with the first option matching type and (optionally) text. */
  pick(t: string, text = '') {
    const r = this.m.req
    if (!r) throw new Error(`no request, wanted ${t}`)
    const i = r.opts.findIndex((o) => o.t === t && (!text || o.label.includes(text) || (o.uid != null && this.m.name(o.uid).includes(text))))
    if (i < 0) throw new Error(`no option ${t} ${text} in [${r.kind}] ${this.opts().join(' | ')}`)
    this.m.answer(i)
    if (t === 'skip') this.started = true
    return this
  }
  /** Pass or skip everything until a request of this kind for this player comes up. */
  private started = false
  until(kind: string, p?: Side) {
    // The match is waiting on the opening Ena Charge, asked before the table was set up.
    if (!this.started) this.pick('skip')
    for (let n = 0; n < 200 && this.m.req; n++) {
      const r = this.m.req
      if (r.kind === kind && (p == null || r.p === p)) return this
      const i = r.opts.findIndex((o) => ['skip', 'end', 'pass', 'take', 'no'].includes(o.t))
      this.m.answer(i < 0 ? 0 : i)
    }
    return this
  }
}

// 1. Paying costs, "when played" effects and Overbeat discounts.
{
  const t = new T(0).hand(0, 'Leomaru', 'Enra Madame', 'Raiju Leo').ena(0, 'Raiju Leo', 'Raiju Leo', 'Raiju Leo', 'Raiju Leo')
  const m = t.m
  t.pick('skip')
  t.pick('play', 'Leomaru')
  ok(m.P(0).hand.length === 3 && m.unused(0) === 2, 'Leomaru costs 2 and draws 1 when played')
  ok(t.opts().some((l) => l.includes('Overbeat Leomaru') && l.includes('pay 2')), 'Overbeat with a cost 4 onto a cost 2 costs 2')
  t.pick('play', 'Enra Madame')
  ok(m.name(m.top(0, 0)!) === 'Enra Madame' && m.under(0, 0) === 1, 'Overbeat stacks on top of its base')
}
// 2. Color: you need Ena of the card's color (or an Overbeat base of that color).
{
  const t = new T(0).hand(0, 'Tofu Kozo', 'Valiant Beniten').ena(0, 'Raiju Leo', 'Raiju Leo', 'Raiju Leo', 'Raiju Leo')
  t.pick('skip')
  ok(!t.m.req || t.m.req.kind !== 'main' || t.m.req.p !== 0, 'A blue card cannot be played with only red Ena')
}
{
  const t = new T(0).hand(0, 'Valiant Beniten').ena(0, 'Raiju Leo', 'Raiju Leo').line(0, 0, 'Tofu Kozo')
  t.pick('skip')
  ok(t.opts().some((l) => l.includes('Overbeat Tofu Kozo')), 'A blue Overbeat base covers the color requirement')
  ok(!t.opts().some((l) => l.includes('Play to Line')), 'but it still cannot be played to a new line with red Ena')
}
// 3. Battle: the loser is downed and its player takes 1 damage; a downed loser is destroyed.
{
  const t = new T(0).line(0, 0, 'Raiju Leo').line(1, 0, 'Leomaru')
  const m = t.m
  t.until('charge')
  ok(m.s.round === 2 && m.isDown(1, 0) && m.P(1).hearts.length === 5 && m.P(1).hearts[4].down, 'Loser is downed and the top Heart is downed')
  ok(m.s.first === 0, 'The Line 1 winner goes first next round')
  t.until('check', 1)
  ok(m.top(1, 0) == null && m.P(1).hearts.length === 4, 'A downed loser is destroyed and the downed Heart is destroyed')
}
// 4. A draw downs both and switches the First Player.
{
  const t = new T(0).line(0, 0, 'Raiju Leo').line(1, 0, 'Katakirauwa')
  t.until('charge', 1)
  ok(t.m.isDown(0, 0) && t.m.isDown(1, 0) && t.m.P(0).hearts.every((h) => !h.down), 'A draw downs both Horobeat and hurts no player')
  ok(t.m.s.first === 1 && t.m.s.round === 2, 'A Line 1 draw switches the First Player')
}
// 5. Double Damage, Barrier, and Don Dekakegen sending the blocked damage back.
{
  const t = new T(0).line(0, 0, 'Raiju Mom').line(1, 0, 'Rare Kegen')
  t.until('charge'); ok(t.m.P(1).hearts.every((h) => !h.down), '2 Barrier blocks Double Damage completely')
}
{
  const t = new T(0).line(0, 0, 'Thousand-Year Tree Spirit Kyodama').line(1, 0, 'Don Dekakegen')
  t.until('charge')
  ok(t.m.P(0).hearts[4].down && t.m.P(1).hearts.every((h) => !h.down), 'Don Dekakegen deals the blocked damage back')
}
// 6. Finishing Blow needs the player to have no Hearts when the damage arrives.
{
  const t = new T(0).line(0, 0, 'Raiju Mom').hearts(1, 1, true)
  t.until('check', 1)
  ok(t.m.P(1).hearts.length === 0 && t.m.s.phase !== 'over', 'Extra damage past the last Heart does not finish the game')
  t.until('charge', 0); t.until('main', 1); t.until('nothing')
  ok(t.m.s.phase === 'over' && t.m.s.winner === 0, 'Damage with no Hearts left is a Finishing Blow')
}
// 7. Waza, Boost, Resonance and passing.
{
  const t = new T(0).line(0, 0, 'Leomaru').line(1, 0, 'Raiju Leo').hand(0, 'Telepathy', 'Kamaitachi Kamaichi').ena(0, 'Raiju Leo', 'Raiju Leo')
  const m = t.m
  t.until('battle', 0)
  t.pick('waza', 'Telepathy')
  ok(m.power(0, 0) === 5000 && m.P(0).hand.length === 2, 'Telepathy with Resonance: +3000 and draw 1')
  t.until('battle', 0)
  t.pick('boost', 'Kamaichi')
  t.until('charge')
  ok(m.log.some((l) => l.text.includes('Leomaru 7000 vs Raiju Leo 4000')), 'Boost adds 2000 on top of the Waza')
  ok(m.isDown(1, 0) && m.P(0).grave.length === 2 && m.P(0).waza[0].length === 0, 'Waza and Boost go to the Graveyard after the battle')
}
// 8. Triggers: Entry, Draw and Last Over.
{
  const t = new T(0).line(0, 0, 'Raiju Mom').hearts(1, 2, true).heartTop(1, 'Lightning Strike').heartTop(1, 'Raiju Leo')
  const m = t.m
  t.until('check', 1)
  ok(m.P(1).check.length === 2, 'Two Hearts destroyed at once go to the Check Zone together')
  t.pick('trig-draw'); ok(m.P(1).hand.length === 3, 'Draw Trigger draws 3')
  t.pick('trig-play', 'Raiju Leo'); ok(m.name(m.top(1, 0)!) === 'Raiju Leo', 'Entry Trigger plays the Horobeat for free')
}
{
  const t = new T(0).line(0, 0, 'Raiju Leo').line(1, 0, 'Leomaru', true).hearts(1, 1, true).heartTop(1, 'Raiju Mom')
  const m = t.m
  t.until('check', 1)
  // Line 1 was destroyed, so there is nothing to Overbeat: it still goes to hand and draws 1.
  t.pick('trig-last'); ok(m.P(1).hand.length === 2, 'Last Over Trigger adds the card to hand and draws 1')
}
{
  const t = new T(0).line(0, 0, 'Raiju Leo').line(1, 0, 'Leomaru').line(1, 1, 'Raiju Leo').hearts(1, 1, true).heartTop(1, 'Raiju Mom')
  t.until('check', 1); t.pick('trig-last')
  ok(t.m.req!.kind === 'pick' && t.opts().some((l) => l.includes('Overbeat')), 'With 1 or fewer Hearts it may then Overbeat for free')
  t.pick('play'); ok(t.m.P(1).lines.some((st) => st && t.m.name(st.cards[st.cards.length - 1]) === 'Raiju Mom'), 'and it enters play')
}
// 9. Card rulings from the official FAQ.
{
  const t = new T(0).hand(0, 'Faceless Rider').ena(0, 'Raiju Leo', 'Raiju Leo', 'Raiju Leo', 'Raiju Leo').line(0, 0, 'Leomaru')
  t.pick('skip'); ok(!t.opts().some((l) => l.includes('Overbeat')), 'Faceless Rider cannot Overbeat from hand')
}
{
  const t = new T(0).hand(0, 'Undying Shinazui', 'Tsukumono Jumbo', 'Taverna and Futakuchi Girl').ena(0, 'Tsukumono Jumbo', 'Tsukumono Jumbo', 'Tsukumono Jumbo').line(0, 0, 'Shinazui-sama')
  t.pick('skip'); ok(!t.opts().some((l) => l.includes('Overbeat Shinazui-sama')) || t.opts().every((l) => !l.startsWith('Overbeat Shinazui-sama') || l.includes('pay 0')), 'Shinazui-sama counts as cost 3 in a line')
  ok(t.m.req!.opts.filter((o) => o.via === 'over').every((o) => t.m.name(o.uid!) !== 'Taverna and Futakuchi Girl'), 'a cost 3 cannot Overbeat it')
}
{
  const t = new T(0).hand(0, 'Yosuzume').ena(0, 'Raiju Leo', 'Raiju Leo', 'Raiju Leo').line(0, 0, 'Leomaru')
  t.pick('skip'); ok(!t.m.req || t.m.req.kind !== 'main', 'Yosuzume needs a 4000+ Horobeat next to it')
}
{
  const t = new T(0).line(0, 0, 'Mystic Fox Nanao').line(1, 0, 'Raiju Mom')
  t.until('charge'); ok(!t.m.isDown(0, 0), 'Mystic Fox Nanao recovers even with no red Ena')
}
{
  const t = new T(0).line(0, 0, 'Jr. Red Ray', true).line(1, 0, 'Raiju Mom')
  t.until('check', 0); ok(t.m.top(0, 0) != null, 'A Horobeat that cannot be destroyed stays in its line')
}
// 10. End Phase: slide, Ena Draw and refresh.
{
  const t = new T(0).line(0, 2, 'Raiju Leo').ena(0, 'Raiju Leo', 'Raiju Leo')
  const before = t.m.P(0).hand.length
  t.until('charge', 0)
  ok(t.m.top(0, 0) != null && t.m.top(0, 2) == null, 'Horobeat slide in toward Line 1')
  ok(t.m.P(0).hand.length === before + 2 + 1, 'Ena Draw: 1 card per unused Ena, plus the normal draw')
}
// 11. Blaze Overbeat destroys a Horobeat with half its power or less, skipping Barrier.
{
  const t = new T(0).line(0, 0, 'Blaze Overbeat Shinazuisho').line(1, 0, 'Rare Kegen')
  t.until('charge'); ok(t.m.top(1, 0) == null && t.m.P(1).hearts.length === 4, 'Blaze Overbeat destroys it and Barrier does not apply')
}
// 12. Keep Away from Danger, Kid switches off Barrier before damage.
{
  const t = new T(0).line(0, 0, 'Raiju Leo').line(1, 0, 'Keukegen').hand(0, 'Keep Away from Danger, Kid').ena(0, 'Tofu Kozo')
  t.until('battle', 0); t.pick('waza'); t.until('charge')
  ok(t.m.P(1).hearts[4].down, 'A silenced Barrier does not reduce damage')
}
console.log(`${passed} rule checks passed`)
