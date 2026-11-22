// One computer player against another, over the standing test decks, swapping seats.
//   npx tsx tools/bot-lab/ladder.ts horobeat hard normal 200
//   npx tsx tools/bot-lab/ladder.ts haikyu expert:sims=600 expert 100
// Give player A a different set of habit numbers with --weights=tuned-haikyu.json (output of tune.ts);
// player B keeps the current ones. This is how a tuned set is confirmed at Hard level.
import fs from 'node:fs'
import { decksFor, game, margin, pct, playMatch, seat } from './lab'
const flags = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => x.slice(2).split('=')))
const [gameName, a, b, gamesS = '100', ...files] = process.argv.slice(2).filter((x) => !x.startsWith('--'))
const g = game(gameName)
const decks = decksFor(gameName, files)
const A = seat(a)
const B = seat(b)
const tuned = flags.weights ? { ...g.weights, ...JSON.parse(fs.readFileSync(flags.weights, 'utf8')).weights } : null
const seedBase = 7000 + +(flags.seed || 0) * 100000
let w = 0
let n = 0
const t0 = Date.now()
for (let i = 0; i < +gamesS; i++) {
  const pair = Math.floor(i / 2)
  const flip = i % 2
  const d1 = decks[pair % decks.length]
  const d2 = decks[(pair * 3 + 1) % decks.length]
  if (tuned) { g.seatWeights[flip ? 1 : 0] = tuned; g.seatWeights[flip ? 0 : 1] = null }
  const { winner } = playMatch(g, { seed: seedBase + pair * 91, decks: [d1.ids, d2.ids], names: ['A', 'B'] }, flip ? [B, A] : [A, B])
  if (winner == null) continue
  n++
  if (winner === (flip ? 1 : 0)) w++
}
console.log(`${g.label}: ${A.label}${tuned ? ' with tuned numbers' : ''} beats ${B.label} ${pct(w, n)} of the time over ${n} games (margin of error about ${margin(n)} points, ${((Date.now() - t0) / n / 1000).toFixed(2)}s a game)`)
