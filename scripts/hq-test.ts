// Plays many Haikyu matches with the computer and with random choices, checking the rules
// engine never breaks or loses a card. Run with: npx tsx scripts/hq-test.ts [games]
import { DEFS, HQ, type Side } from '../src/sim/hq/engine'
import { HQ_SCRIPTS } from '../src/sim/hq/scripts'
import { cpuChoice } from '../src/sim/hq/ai'
import { HQ_PRACTICE } from '../src/sim/hq/decks'

const nos = new Set([...DEFS.values()].map((d) => d.no))
for (const k of Object.keys(HQ_SCRIPTS)) if (!nos.has(k)) throw new Error(`Script for unknown card number: ${k}`)
const withText = [...new Map([...DEFS.values()].map((d) => [d.no, d])).values()].filter((d) => d.text.trim())
const missing = withText.filter((d) => !HQ_SCRIPTS[d.no])
console.log(`card numbers with text: ${withText.length}, scripted: ${withText.length - missing.length}`)
if (missing.length) console.log('not scripted:', missing.map((d) => `${d.no} ${d.name}`).join(' | '))
for (const d of HQ_PRACTICE) {
  const ev = d.ids.filter((id) => DEFS.get(id)!.type === 'Event').length
  console.log(d.name, d.ids.length, 'events', ev)
  if (d.ids.length !== 40 || ev > 8) throw new Error('bad practice deck ' + d.name)
}

let seed = 777
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const all = [...DEFS.values()]
function randomDeck(): string[] {
  const team = HQ_PRACTICE[Math.floor(rnd() * HQ_PRACTICE.length)].team
  const pool = all.filter((d) => rnd() < 0.15 || d.schools.includes(team))
  const ids: string[] = []
  let ev = 0
  while (ids.length < 40) {
    const d = pool[Math.floor(rnd() * pool.length)]
    if (d.type === 'Event') { if (ev >= 8) continue; ev++ }
    ids.push(d.id)
  }
  return ids
}
function check(m: HQ) {
  const seen = new Set<number>()
  const add = (u: number) => { if (seen.has(u)) throw new Error(`card ${u} ${m.def(u).name} is in two places`); seen.add(u) }
  for (const p of [0, 1] as Side[]) {
    const P = m.P(p)
    for (const key of ['deck', 'hand', 'drop', 'event', 'score', 'serve', 'center', 'sides', 'receive', 'set', 'attack'] as const) P[key].forEach(add)
    if (P.sides.length > 2) throw new Error('too many side blockers')
  }
  if (seen.size !== m.s.cards.length) throw new Error(`cards lost: ${seen.size} of ${m.s.cards.length}`)
}

const games = Number(process.argv[2] || 300)
const stats = { wins: [0, 0], sets: 0, decisions: 0, reasons: new Map<string, number>(), kinds: new Map<string, number>(), turns: 0, errs: 0 }
for (let gi = 0; gi < games; gi++) {
  const mode = gi % 4
  const decks: [string[], string[]] = mode === 0 ? [HQ_PRACTICE[gi % HQ_PRACTICE.length].ids, HQ_PRACTICE[(gi + 3) % HQ_PRACTICE.length].ids] : [randomDeck(), randomDeck()]
  const setup = { seed: gi * 7919 + 3, decks, names: ['A', 'B'] as [string, string] }
  const m = new HQ(setup)
  let n = 0
  try {
    while (m.req) {
      const r = m.req
      stats.kinds.set(r.kind, (stats.kinds.get(r.kind) || 0) + 1)
      const random = mode === 2 || (mode === 3 && r.p === 1)
      m.answer(random ? Math.floor(rnd() * r.opts.length) : cpuChoice(m, gi % 2 ? 'normal' : 'easy', rnd))
      check(m)
      if (++n > 6000) throw new Error('match did not end')
    }
    const again = HQ.replay(setup, m.answers)
    if (again.s.winner !== m.s.winner || again.log.length !== m.log.length) throw new Error('replay differs')
  } catch (e) {
    console.log(`FAILED game ${gi} mode ${mode} after ${n} decisions`)
    console.log(m.log.slice(-14).map((l) => l.text).join('\n'))
    throw e
  }
  stats.wins[m.s.winner!]++
  stats.sets += m.s.setNo
  stats.turns += m.s.turnNo
  stats.decisions += n
  const why = m.s.reason.replace(/^[AB] /, 'X ')
  stats.reasons.set(why, (stats.reasons.get(why) || 0) + 1)
}
console.log(`${games} matches ok. wins A/B ${stats.wins}, avg sets ${(stats.sets / games).toFixed(1)}, avg turns ${(stats.turns / games).toFixed(1)}, avg decisions ${(stats.decisions / games).toFixed(0)}`)
console.log([...stats.reasons].map(([k, v]) => `${v}x ${k}`).join(' | '))
console.log([...stats.kinds].map(([k, v]) => `${k}:${v}`).join(' '))
