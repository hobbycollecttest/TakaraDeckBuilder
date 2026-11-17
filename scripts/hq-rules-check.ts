import { DEFS, HQ, type Side } from '../src/sim/hq/engine'
import { HQ_PRACTICE } from '../src/sim/hq/decks'
import { eventLE, enteredBy, N } from '../src/sim/hq/kit'
let fails = 0
const ok = (c: boolean, msg: string) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++ }
const setup = { seed: 5, decks: [HQ_PRACTICE[0].ids, HQ_PRACTICE[1].ids] as [string[], string[]], names: ['A', 'B'] as [string, string] }
const m = new HQ(setup)
// 1. Serve choice and partial redraw
ok(m.req!.kind === 'serve', 'a random player is asked whether to serve first')
m.answer(1) // give it away
const chooser = m.log.find((l) => /first serve/.test(l.text))!.text
ok(/gives up/.test(chooser), 'giving up the serve hands it to the other player: ' + chooser)
ok(m.req!.kind === 'mulligan' && m.req!.opts.some((o) => o.t === 'pick'), 'redraw offers choosing which cards to put back')
const p = m.req!.p
const before = [...m.P(p).hand]
m.answer(m.req!.opts.findIndex((o) => o.t === 'pick'))
m.answer(m.req!.opts.findIndex((o) => o.t === 'card'))
m.answer(m.req!.opts.findIndex((o) => o.t === 'card'))
m.answer(m.req!.opts.findIndex((o) => o.t === 'no'))
const after = m.P(p).hand
ok(after.length === 6 && before.filter((u) => after.includes(u)).length >= 4, `put back 2, kept the other 4, back to 6 (${after.length})`)
// 2. "Becomes N" then "+N" stacks
const uid = m.P(0).deck.find((u) => m.def(u).type === 'Character' && m.def(u).at != null)!
m.P(0).deck.splice(m.P(0).deck.indexOf(uid), 1); m.P(0).attack.push(uid)
m.pump(uid, 'at', 2); m.fix(uid, 'at', 4); m.pump(uid, 'at', 1)
ok(m.param(uid, 'at') === 5, `+2, then becomes 4, then +1 gives 5 (got ${m.param(uid, 'at')})`)
m.fix(uid, 'at', 6)
ok(m.param(uid, 'at') === 6, 'a later "becomes 6" overrides earlier changes')
// 3. FOUR SET counts only FOUR SET cards
const ctx = { p: 0 as Side, uid, paid: [], seen: [] }
const ev = [...DEFS.values()].filter((d) => d.type === 'Event' && d.name !== 'FOUR SET').slice(0, 3).map((d) => { m.s.cards.push(d.id); return m.s.cards.length - 1 })
m.P(0).event.push(...ev)
ok(eventLE(2, N('FOUR SET'))(m, ctx) === true, 'FOUR SET still works with 3 other Events in the Event Area')
// 4. "Entered by a skill of SPOT ON" matches the card named "Spot On"
m.s.entry[uid] = { from: 'guts', by: 'Spot On', onTop: null, turn: m.s.turnNo, asSide: false }
ok(enteredBy('SPOT ON')(m, ctx), 'entered by "Spot On" counts as SPOT ON')
console.log(fails ? `${fails} FAILED` : 'all checks passed')
