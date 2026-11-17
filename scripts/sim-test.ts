// Plays many CPU matches and random-choice matches, checking the rules engine never
// breaks. Run with: npx tsx scripts/sim-test.ts [games]
import { DEFS, Match, type Side } from '../src/sim/engine'
import { SCRIPTS } from '../src/sim/scripts'
import { cpuChoice } from '../src/sim/ai'
import { PRACTICE } from '../src/sim/decks'

const names = new Set([...DEFS.values()].map((d) => d.name))
for (const k of Object.keys(SCRIPTS)) if (!names.has(k)) throw new Error(`Script for unknown card: ${k}`)
const unscripted = [...new Map([...DEFS.values()].map((d) => [d.name, d])).values()].filter((d) => d.effect && !SCRIPTS[d.name])
console.log('cards with text but no script:', unscripted.map((d) => d.name))
for (const d of PRACTICE) console.log(d.name, d.ids.length)

let seed = 12345
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const all = [...DEFS.values()]
function randomDeck(): string[] {
  const colors = ['Red', 'Green', 'Blue'].filter(() => rnd() < 0.6)
  const pool = all.filter((d) => !colors.length || colors.includes(d.color))
  const ids: string[] = []
  const count = new Map<string, number>()
  while (ids.length < 50) {
    const d = pool[Math.floor(rnd() * pool.length)]
    if ((count.get(d.name) || 0) >= 4) continue
    count.set(d.name, (count.get(d.name) || 0) + 1)
    ids.push(d.id)
  }
  return ids
}
function check(m: Match) {
  const seen = new Set<number>()
  const add = (u: number) => { if (seen.has(u)) throw new Error(`card ${u} ${m.name(u)} is in two places`); seen.add(u) }
  for (const p of [0, 1] as Side[]) {
    const P = m.P(p)
    P.deck.forEach(add); P.hand.forEach(add); P.check.forEach(add); P.grave.forEach(add)
    P.hearts.forEach((h) => add(h.uid)); P.ena.forEach((e) => add(e.uid))
    P.lines.forEach((st) => st?.cards.forEach(add)); P.waza.forEach((z) => z.forEach((w) => add(w.uid)))
    P.lines.forEach((st) => { if (st && !st.cards.length) throw new Error('empty stack') })
  }
  if (seen.size !== m.s.cards.length) throw new Error(`cards lost: ${seen.size} of ${m.s.cards.length}`)
}

const games = Number(process.argv[2] || 400)
const stats = { wins: [0, 0], rounds: 0, decisions: 0, reasons: new Map<string, number>(), kinds: new Map<string, number>() }
for (let g = 0; g < games; g++) {
  const mode = g % 4 // 0,1: CPU vs CPU practice/random decks, 2: random choices, 3: CPU vs random
  const decks: [string[], string[]] = mode === 0 ? [PRACTICE[g % 3].ids, PRACTICE[(g + 1 + (g >> 2)) % 3].ids] : [randomDeck(), randomDeck()]
  const setup = { seed: g * 7919 + 1, decks, names: ['A', 'B'] as [string, string] }
  const m = new Match(setup)
  let n = 0
  try {
    while (m.req) {
      const r = m.req
      stats.kinds.set(r.kind, (stats.kinds.get(r.kind) || 0) + 1)
      const random = mode === 2 || (mode === 3 && r.p === 1)
      m.answer(random ? Math.floor(rnd() * r.opts.length) : cpuChoice(m, g % 2 ? 'normal' : 'easy', rnd))
      check(m)
      if (++n > 20000) throw new Error('match did not end')
    }
    // A replay from the saved answers must land on the same result.
    const again = Match.replay(setup, m.answers)
    if (again.s.winner !== m.s.winner || again.log.length !== m.log.length) throw new Error('replay differs')
  } catch (e) {
    console.log(`FAILED game ${g} mode ${mode} after ${n} decisions`)
    console.log(m.log.slice(-12).map((l) => l.text).join('\n'))
    throw e
  }
  stats.wins[m.s.winner!]++
  stats.rounds += m.s.round
  stats.decisions += n
  stats.reasons.set(m.s.reason, (stats.reasons.get(m.s.reason) || 0) + 1)
}
console.log(`${games} matches ok. wins A/B ${stats.wins}, avg rounds ${(stats.rounds / games).toFixed(1)}, avg decisions ${(stats.decisions / games).toFixed(0)}`)
console.log([...stats.reasons].map(([k, v]) => `${v}x ${k.replace(/^[AB] /, 'X ')}`).join(' | '))
console.log([...stats.kinds].map(([k, v]) => `${k}:${v}`).join(' '))
