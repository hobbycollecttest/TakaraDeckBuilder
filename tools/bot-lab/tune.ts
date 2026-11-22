// Tunes the numbers behind the Normal habits by self-play. Each round it nudges a few numbers, plays the
// new set against the current one, and keeps it only if it wins clearly, twice (a second batch of fresh
// games guards against luck). Prints the best set; copy it into WEIGHTS in the game's ai.ts by hand.
//   npx tsx tools/bot-lab/tune.ts haikyu --minutes=30 --games=2000 --seed=1
// A habit change also changes how Hard and Expert judge positions, so afterwards confirm with
//   npx tsx tools/bot-lab/ladder.ts <game> hard hard --weights=<file>     (see ladder.ts)
import fs from 'node:fs'
import { decksFor, game, playMatch, rng, seat } from './lab'
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const [gameName] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const g = game(gameName)
const decks = decksFor(gameName)
const N = +(flags.games || 2000)
const minutes = +(flags.minutes || 20)
const out = flags.out || `tuned-${gameName}.json`
const r = rng(+(flags.seed || 1) * 7717)
const who = seat(flags.player || 'normal')
type W = Record<string, number>
let best: W = flags.from ? JSON.parse(fs.readFileSync(flags.from, 'utf8')).weights : { ...g.weights }
let batch = 0
/** Share of games the candidate wins against the current best, seats and decks swapped evenly. */
function duel(cand: W, base: W, games: number) {
  batch++
  let w = 0
  let n = 0
  for (let i = 0; i < games; i++) {
    const pair = Math.floor(i / 2)
    const flip = i % 2
    g.seatWeights[flip ? 1 : 0] = cand
    g.seatWeights[flip ? 0 : 1] = base
    const { winner } = playMatch(g, { seed: batch * 1000003 + pair * 97, decks: [decks[pair % decks.length].ids, decks[(pair * 3 + 1) % decks.length].ids], names: ['A', 'B'] }, [who, who])
    if (winner == null) continue
    n++
    if (winner === (flip ? 1 : 0)) w++
  }
  g.seatWeights[0] = g.seatWeights[1] = null
  return n ? w / n : 0.5
}
const keys = Object.keys(best)
const whole = (k: string) => Number.isInteger(g.weights[k])
const log: string[] = []
const start = Date.now()
const se = 0.5 / Math.sqrt(N)
let tried = 0
console.log(`${g.label}: tuning ${keys.length} numbers, ${N} games a test (margin about ${(se * 100).toFixed(1)} points), ${minutes} minutes`)
while (Date.now() - start < minutes * 60000) {
  const cand = { ...best }
  const changed: string[] = []
  const count = r() < 0.6 ? 1 : 2
  for (let c = 0; c < count; c++) {
    const k = keys[Math.floor(r() * keys.length)]
    const before = cand[k]
    if (whole(k)) cand[k] = Math.max(0, before + (r() < 0.5 ? -1 : 1))
    else cand[k] = +(before * [0.5, 0.7, 0.85, 1.2, 1.5, 2][Math.floor(r() * 6)]).toFixed(3)
    if (cand[k] !== before) changed.push(`${k} ${before} -> ${cand[k]}`)
  }
  if (!changed.length) continue
  tried++
  const first = duel(cand, best, N)
  if (first < 0.5 + 2.2 * se) continue
  const second = duel(cand, best, N * 2)
  const line = `${changed.join(', ')}: ${(first * 100).toFixed(1)}% then ${(second * 100).toFixed(1)}%`
  if (second < 0.5 + 1.5 * (0.5 / Math.sqrt(N * 2))) { console.log('  not confirmed  ' + line); continue }
  best = cand
  log.push(line)
  console.log('  KEPT  ' + line)
  fs.writeFileSync(out, JSON.stringify({ game: gameName, tried, kept: log, weights: best }, null, 1))
}
fs.writeFileSync(out, JSON.stringify({ game: gameName, tried, kept: log, weights: best }, null, 1))
console.log(`tried ${tried}, kept ${log.length} -> ${out}`)
