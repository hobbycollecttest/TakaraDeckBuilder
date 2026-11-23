// The deck builder. It starts from a deck and keeps changing cards for as long as the changes win more
// games against the field (the standing test decks unless --field= is given).
//   npx tsx tools/bot-lab/build.ts horobeat decks/horobeat/ecoeco-raiga-swarm-red.json --minutes=60 --out=results/built-red.json
// Flags: --pilot=hard:sims=12 (who plays the test games), --colors=Red,Green (cards it may add; default
// is the colors already in the deck), --seed=1, --tries=160 (changes screened per round).
//
// Every round has three stages, because one batch of games flatters changes (see README, lessons):
//   1. Screen: many random changes, each played quickly by the Normal bot. Only used to pick what to test properly.
//   2. Test: the most promising ones, played by the Hard bot against the unchanged deck on the same games.
//   3. Confirm: the winners again, on fresh games. Only a change that wins both times is kept.
// At the end the finished deck plays the starting deck's games one more time, on games neither has seen.
import fs from 'node:fs'
import path from 'node:path'
import { DEFS } from '../../src/sim/engine'
import { decksFor, game, loadDeck, playMatch, rng, seat, type Deck, type Seat } from './lab'

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const [gameName, startFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (gameName !== 'horobeat' && gameName !== 'hb') throw new Error('The deck builder knows HORO-BEAT deck rules only so far (50 cards, up to 4 of a name).')
const g = game(gameName)
const start = loadDeck(startFile)
const pilot = seat(flags.pilot || 'hard:sims=12')
const quick = seat('normal')
const minutes = +(flags.minutes || 60)
const tries = +(flags.tries || 160)
const r = rng(+(flags.seed || 1) * 9973)
const out = flags.out || `results/built-${path.basename(startFile, '.json')}.json`
const field = decksFor(gameName, flags.field ? flags.field.split(',') : []).filter((d) => path.resolve(d.file) !== path.resolve(start.file))
const SIZE = 50
const MAX = 4

// One printing per card name: the copy limit is by name, and printings play the same.
const nameOf = (id: string) => { const d = DEFS.get(id)! as { jp?: string; name: string }; return d.jp || d.name }
const counts = new Map<string, number>()
for (const id of start.ids) counts.set(id, (counts.get(id) || 0) + 1)
const colors = new Set((flags.colors ? flags.colors.split(',') : [...new Set(start.ids.map((id) => DEFS.get(id)!.color))]) as string[])
const printing = new Map<string, string>()
for (const id of counts.keys()) printing.set(nameOf(id), id)
for (const d of DEFS.values()) if (colors.has(d.color) && !printing.has(nameOf(d.id))) printing.set(nameOf(d.id), d.id)
const pool = [...printing.values()]

type Counts = Map<string, number>
const ids = (c: Counts) => [...c.entries()].flatMap(([id, n]) => Array(n).fill(id) as string[])
const label = (id: string) => { const d = DEFS.get(id)!; return `${d.name} (${d.color} ${d.type === 'Waza' ? 'Waza ' : ''}${d.cost})` }
type Move = { out: string; in: string; n: number }
const say = (m: Move) => `${m.n} ${label(m.out)} out, ${m.n} ${label(m.in)} in`
function apply(c: Counts, m: Move): Counts {
  const next = new Map(c)
  const left = next.get(m.out)! - m.n
  if (left) next.set(m.out, left); else next.delete(m.out)
  next.set(m.in, (next.get(m.in) || 0) + m.n)
  return next
}
function randomMove(c: Counts): Move | null {
  const have = [...c.keys()]
  const o = have[Math.floor(r() * have.length)]
  const i = pool[Math.floor(r() * pool.length)]
  if (i === o) return null
  const room = Math.min(c.get(o)!, MAX - (c.get(i) || 0))
  if (room < 1) return null
  return { out: o, in: i, n: Math.min(room, 1 + Math.floor(r() * 2)) }
}

/** Win or loss of one deck on each of a set of games (same opponents, seats and shuffles for every deck). */
function play(deck: string[], who: Seat, seed0: number, n: number): number[] {
  const res: number[] = []
  for (let i = 0; i < n; i++) {
    const mine = (i % 2) as 0 | 1
    const opp = field[i % field.length]
    const { winner } = playMatch(g, { seed: seed0 + i * 257, decks: mine ? [opp.ids, deck] : [deck, opp.ids], names: ['A', 'B'] }, [who, who])
    res.push(winner === mine ? 1 : winner == null ? 0.5 : 0)
  }
  return res
}
/** How many points better `a` did than `b` on the same games, and how sure that is (in standard errors). */
function versus(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  let sum = 0, sq = 0
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; sum += d; sq += d * d }
  const avg = sum / n
  const se = Math.sqrt(Math.max(1e-9, sq / n - avg * avg) / n)
  return { points: 100 * avg, sure: avg / se, n }
}
const rate = (x: number[]) => (100 * x.reduce((a, b) => a + b, 0) / x.length).toFixed(1) + '%'

const t0 = Date.now()
const left = () => minutes * 60000 - (Date.now() - t0)
let deck: Counts = counts
const kept: { move: Move; test: number; confirm: number }[] = []
let round = 0
console.log(`Building from ${start.name}, piloted by ${pilot.label}, against ${field.length} decks, for ${minutes} minutes. Cards it may add: ${[...colors].join(', ')} (${pool.length} names).`)
while (left() > 0) {
  round++
  const seedA = 10_000_000 + round * 1_000_003
  // 1. Screen with the Normal bot.
  const baseQuick = play(ids(deck), quick, seedA, 1500)
  const seen = new Set<string>()
  const screened: { move: Move; points: number }[] = []
  for (let t = 0; t < tries && left() > 0; t++) {
    const m = randomMove(deck)
    if (!m || seen.has(m.out + m.in + m.n)) continue
    seen.add(m.out + m.in + m.n)
    screened.push({ move: m, points: versus(play(ids(apply(deck, m)), quick, seedA, 1500), baseQuick).points })
  }
  screened.sort((a, b) => b.points - a.points)
  // The best few from the screen, plus two it did not rate, so the Normal bot's taste is not the only way in.
  const shortlist = [...screened.slice(0, 5), ...screened.slice(5).sort(() => r() - 0.5).slice(0, 2)]
  console.log(`\nRound ${round}: screened ${screened.length} changes. Testing: ${shortlist.map((s) => `${say(s.move)} [${s.points.toFixed(1)}]`).join(' | ')}`)
  // 2. Test with the real pilot, in two steps so clear losers stop early.
  const seedB = seedA + 500_000
  let base = play(ids(deck), pilot, seedB, 140)
  let alive = shortlist.map((s) => ({ move: s.move, res: play(ids(apply(deck, s.move)), pilot, seedB, 140) })).filter((c) => versus(c.res, base).points > 0)
  if (alive.length && left() > 0) {
    base = [...base, ...play(ids(deck), pilot, seedB + 140 * 257, 160)]
    for (const c of alive) c.res = [...c.res, ...play(ids(apply(deck, c.move)), pilot, seedB + 140 * 257, 160)]
    alive = alive.filter((c) => versus(c.res, base).points >= 2)
  }
  if (!alive.length) { console.log('  nothing beat the current deck on the first test'); continue }
  // 3. Confirm on fresh games.
  const seedC = seedA + 800_000
  const baseC = play(ids(deck), pilot, seedC, 400)
  const confirmed: { move: Move; test: number; confirm: number; sure: number }[] = []
  for (const c of alive) {
    const test = versus(c.res, base)
    const conf = versus(play(ids(apply(deck, c.move)), pilot, seedC, 400), baseC)
    const both = versus([...c.res, ...play(ids(apply(deck, c.move)), pilot, seedC, 400)], [...base, ...baseC])
    const ok = conf.points > 0 && both.sure > 2
    console.log(`  ${ok ? 'KEPT    ' : 'dropped '} ${say(c.move)}: first test +${test.points.toFixed(1)} over ${test.n}, confirm ${conf.points >= 0 ? '+' : ''}${conf.points.toFixed(1)} over ${conf.n}`)
    if (ok) confirmed.push({ move: c.move, test: test.points, confirm: conf.points, sure: both.sure })
  }
  // Keep the best, and any others that touch different cards.
  confirmed.sort((a, b) => b.sure - a.sure)
  const touched = new Set<string>()
  for (const c of confirmed) {
    if (touched.has(c.move.out) || touched.has(c.move.in)) continue
    if ((deck.get(c.move.out) || 0) < c.move.n || (deck.get(c.move.in) || 0) + c.move.n > MAX) continue
    touched.add(c.move.out); touched.add(c.move.in)
    deck = apply(deck, c.move)
    kept.push(c)
  }
  save()
}

function save(final?: { start: string; built: string; points: number; games: number; pilot: string }) {
  const deckOut: Record<string, number> = {}
  for (const [id, n] of [...deck.entries()].sort()) deckOut[id] = n
  fs.writeFileSync(out, JSON.stringify({ name: `${start.name} [built]`, from: path.basename(start.file), pilot: pilot.label, rounds: round, changes: kept.map((k) => ({ change: say(k.move), firstTest: +k.test.toFixed(1), confirm: +k.confirm.toFixed(1) })), final, deck: deckOut }, null, 1))
}

// The last word: the finished deck against the starting deck on games neither has seen, with a stronger pilot.
if (ids(deck).length !== SIZE) throw new Error('deck size drifted')
if (kept.length) {
  const judge = seat(flags.judge || 'hard:sims=24')
  const a = play(start.ids, judge, 77_000_000, 600)
  const b = play(ids(deck), judge, 77_000_000, 600)
  const v = versus(b, a)
  console.log(`\nFinal check, piloted by ${judge.label}, 600 fresh games each: start ${rate(a)}, built ${rate(b)}, change ${v.points >= 0 ? '+' : ''}${v.points.toFixed(1)} points (margin about ${(200 * (v.points / 100 / (v.sure || 1))).toFixed(1)}).`)
  save({ start: rate(a), built: rate(b), points: +v.points.toFixed(1), games: 600, pilot: judge.label })
} else console.log('\nNo change survived both tests. The starting deck stands.')
console.log(`\n${kept.length} change(s) kept in ${round} round(s):`)
for (const k of kept) console.log(`  ${say(k.move)}`)
const final: Deck = { name: 'built', file: out, ids: ids(deck) }
console.log(`\nFinal list (${final.ids.length} cards), saved to ${out}:`)
for (const [id, n] of [...deck.entries()].sort((x, y) => DEFS.get(x[0])!.cost - DEFS.get(y[0])!.cost)) console.log(`  ${n}x ${label(id)}`)
