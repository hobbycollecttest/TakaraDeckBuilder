// Every deck plays every other deck. Writes the raw results; report.ts turns them into tables.
//   npx tsx tools/bot-lab/league.ts horobeat hard 8 --out=results/hb.json
// Split a long run across processor cores: --part=1/2 in one terminal, --part=2/2 in another,
// with different --out files, then give both files to report.ts.
// Uses the standing test decks unless deck files are listed at the end.
import fs from 'node:fs'
import path from 'node:path'
import { decksFor, game, playMatch, seat } from './lab'
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const [gameName, who = 'hard', roundsS = '4', ...files] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const g = game(gameName)
const decks = decksFor(gameName, files)
const S = seat(who)
const [part, parts] = (flags.part || '1/1').split('/').map(Number)
const out = flags.out || `league-${gameName}.json`
type Row = { a: string; b: string; games: number; aWins: number; aFirstGames: number; aFirstWins: number; bFirstGames: number; bFirstWins: number }
const rows: Row[] = []
let pairNo = 0
const t0 = Date.now()
for (let i = 0; i < decks.length; i++) for (let j = i + 1; j < decks.length; j++) {
  if (pairNo++ % parts !== part - 1) continue
  const row: Row = { a: decks[i].name, b: decks[j].name, games: 0, aWins: 0, aFirstGames: 0, aFirstWins: 0, bFirstGames: 0, bFirstWins: 0 }
  for (let r = 0; r < +roundsS * 2; r++) {
    const flip = r % 2
    const seed = 100000 + pairNo * 1009 + Math.floor(r / 2) * 131
    const { winner, first } = playMatch(g, { seed, decks: flip ? [decks[j].ids, decks[i].ids] : [decks[i].ids, decks[j].ids], names: ['A', 'B'] }, [S, S])
    if (winner == null) continue
    const aSeat = flip ? 1 : 0
    const aWon = winner === aSeat
    row.games++
    if (aWon) row.aWins++
    if (first === aSeat) { row.aFirstGames++; if (aWon) row.aFirstWins++ } else if (first != null) { row.bFirstGames++; if (!aWon) row.bFirstWins++ }
  }
  rows.push(row)
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ game: g.label, player: S.label, rows }, null, 1))
}
console.log(`${g.label}: ${rows.length} pairings, ${rows.reduce((a, r) => a + r.games, 0)} games in ${((Date.now() - t0) / 60000).toFixed(1)} min -> ${out}`)
