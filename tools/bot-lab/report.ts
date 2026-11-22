// Turns league results into a ranking, a first/second split and a matchup table.
//   npx tsx tools/bot-lab/report.ts results/hb-1.json results/hb-2.json > results/hb.md
import fs from 'node:fs'
import { margin } from './lab'
type Row = { a: string; b: string; games: number; aWins: number; aFirstGames: number; aFirstWins: number; bFirstGames: number; bFirstWins: number }
const files = process.argv.slice(2)
const runs = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as { game: string; player: string; rows: Row[] })
const rows = runs.flatMap((r) => r.rows)
type Stat = { g: number; w: number; fg: number; fw: number; sg: number; sw: number }
const stat: Record<string, Stat> = {}
const vs: Record<string, Record<string, { g: number; w: number }>> = {}
const add = (name: string) => (stat[name] ||= { g: 0, w: 0, fg: 0, fw: 0, sg: 0, sw: 0 })
for (const r of rows) {
  const A = add(r.a)
  const B = add(r.b)
  A.g += r.games; A.w += r.aWins; B.g += r.games; B.w += r.games - r.aWins
  A.fg += r.aFirstGames; A.fw += r.aFirstWins; A.sg += r.bFirstGames; A.sw += r.bFirstGames - r.bFirstWins
  B.fg += r.bFirstGames; B.fw += r.bFirstWins; B.sg += r.aFirstGames; B.sw += r.aFirstGames - r.aFirstWins
  const cell = (x: string, y: string) => ((vs[x] ||= {})[y] ||= { g: 0, w: 0 })
  cell(r.a, r.b).g += r.games; cell(r.a, r.b).w += r.aWins
  cell(r.b, r.a).g += r.games; cell(r.b, r.a).w += r.games - r.aWins
}
const p = (w: number, g: number) => (g ? `${Math.round((100 * w) / g)}%` : '')
const names = Object.keys(stat).sort((x, y) => stat[y].w / stat[y].g - stat[x].w / stat[x].g)
const out: string[] = []
out.push(`# ${runs[0]?.game || 'League'} deck report`, '', `Piloted by: ${runs[0]?.player}. ${rows.reduce((a, r) => a + r.games, 0)} games.`, '')
out.push('## Ranking', '', '| # | Deck | Win rate | Games | Margin of error | Going first | Going second |', '|---|---|---|---|---|---|---|')
names.forEach((n, i) => { const s = stat[n]; out.push(`| ${i + 1} | ${n} | ${p(s.w, s.g)} | ${s.g} | ±${margin(s.g)} | ${p(s.fw, s.fg)} | ${p(s.sw, s.sg)} |`) })
out.push('', '## Matchups', '', 'Each row is that deck\'s win rate against the deck in the column. Each cell is a small sample, so treat single cells as a hint.', '')
out.push(`| | ${names.map((_, i) => i + 1).join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`)
names.forEach((n, i) => out.push(`| ${i + 1}. ${n} | ${names.map((o) => (o === n ? '' : p(vs[n]?.[o]?.w || 0, vs[n]?.[o]?.g || 0))).join(' | ')} |`))
console.log(out.join('\n'))
