// The card swap tester. Every candidate deck plays the same opponents on the same games, so the
// comparison is fair. Always include the unchanged deck as the baseline, and confirm any winner
// with a second run on a different --seed: most first-run gains of 3 to 6 points disappear.
//   npx tsx tools/bot-lab/swaps.ts horobeat hard:sims=12 400 --seed=1 base.json idea-a.json idea-b.json
// Opponents are the standing test decks unless --field=a.json,b.json is given.
import path from 'node:path'
import { decksFor, game, loadDeck, margin, pct, playMatch, seat } from './lab'
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const [gameName, who = 'hard:sims=12', gamesS = '400', ...files] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const g = game(gameName)
const S = seat(who)
const field = decksFor(gameName, flags.field ? flags.field.split(',') : [])
const seed0 = 500000 + +(flags.seed || 1) * 400000
const results: { name: string; w: number; n: number; fw: number; fn: number }[] = []
for (const f of files) {
  const d = loadDeck(f)
  let w = 0, n = 0, fw = 0, fn = 0
  for (let i = 0; i < +gamesS; i++) {
    const mine = (i % 2) as 0 | 1
    const opp = field[i % field.length]
    const { winner, first } = playMatch(g, { seed: seed0 + i * 257, decks: mine ? [opp.ids, d.ids] : [d.ids, opp.ids], names: ['A', 'B'] }, [S, S])
    if (winner == null) continue
    n++
    if (winner === mine) w++
    if (first === mine) { fn++; if (winner === mine) fw++ }
  }
  results.push({ name: path.basename(f, '.json'), w, n, fw, fn })
  console.log(`${path.basename(f, '.json').padEnd(28)} ${pct(w, n).padStart(6)} over ${n}   first ${pct(fw, fn)}, second ${pct(w - fw, n - fn)}`)
}
console.log(`\n${g.label}, piloted by ${S.label}. Margin of error about ${margin(+gamesS)} points per deck; differences smaller than that mean nothing.`)
