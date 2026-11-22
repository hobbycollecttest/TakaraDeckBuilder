// One computer player against another, over the standing test decks, swapping seats.
//   npx tsx tools/bot-lab/ladder.ts horobeat hard normal 200
//   npx tsx tools/bot-lab/ladder.ts haikyu expert:sims=600 expert 100
import { decksFor, game, margin, pct, playMatch, seat } from './lab'
const [gameName, a, b, gamesS = '100', ...files] = process.argv.slice(2)
const g = game(gameName)
const decks = decksFor(gameName, files)
const A = seat(a)
const B = seat(b)
let w = 0
let n = 0
const t0 = Date.now()
for (let i = 0; i < +gamesS; i++) {
  const pair = Math.floor(i / 2)
  const flip = i % 2
  const d1 = decks[pair % decks.length]
  const d2 = decks[(pair * 3 + 1) % decks.length]
  const { winner } = playMatch(g, { seed: 7000 + pair * 91, decks: [d1.ids, d2.ids], names: ['A', 'B'] }, flip ? [B, A] : [A, B])
  if (winner == null) continue
  n++
  if (winner === (flip ? 1 : 0)) w++
}
console.log(`${g.label}: ${A.label} beats ${B.label} ${pct(w, n)} of the time over ${n} games (margin of error about ${margin(n)} points, ${((Date.now() - t0) / n / 1000).toFixed(2)}s a game)`)
