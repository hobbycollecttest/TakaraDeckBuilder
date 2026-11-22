// What do players tend to be holding? Measures, from the lab's own games, how much likelier than chance
// each kind of card is to be in a player's hand (rather than still in the deck), so the bots can lean
// their guesses about hidden cards. Paste the result into HAND_LEAN in the game's ai.ts.
//   npx tsx tools/bot-lab/read-stats.ts horobeat hard:sims=24 200
// Caution: this is how the computer players behave. Real players may hold cards differently.
import { handClass as horobeatClass } from '../../src/sim/ai'
import { handClass as haikyuClass } from '../../src/sim/hq/ai'
import { decksFor, game, gameKey, playMatch, seat } from './lab'
const [gameName, who = 'hard:sims=24', gamesS = '200'] = process.argv.slice(2)
const g = game(gameName)
const key = gameKey(gameName)
const decks = decksFor(gameName)
const S = seat(who)
type Tally = Record<string, { hand: number; pool: number }>
const rows: Tally[] = key === 'horobeat' ? [{}, {}, {}] : [{}]
const totals = rows.map(() => ({ hand: 0, pool: 0 }))
for (let i = 0; i < +gamesS; i++) {
  playMatch(g, { seed: 3300 + i * 59, decks: [decks[i % decks.length].ids, decks[(i * 3 + 1) % decks.length].ids], names: ['A', 'B'] }, [S, S], (m) => {
    const o = 1 - m.req.p
    const P = m.P(o)
    const unused = key === 'horobeat' ? m.unused(o) : 0
    const row = key === 'horobeat' ? Math.min(2, unused) : 0
    const cls = (u: number) => (key === 'horobeat' ? horobeatClass(m, u, unused, P.ena.length) : haikyuClass(m, u))
    const hidden: number[] = key === 'horobeat' ? [...P.deck, ...P.hearts.map((h: { uid: number }) => h.uid)] : [...P.deck, ...P.score]
    for (const u of P.hand) { const c = cls(u); (rows[row][c] ||= { hand: 0, pool: 0 }).hand++; rows[row][c].pool++; totals[row].hand++; totals[row].pool++ }
    for (const u of hidden) { const c = cls(u); (rows[row][c] ||= { hand: 0, pool: 0 }).pool++; totals[row].pool++ }
  })
}
const out = rows.map((r, i) => Object.fromEntries(Object.entries(r).map(([c, t]) => [c, +((t.hand / totals[i].hand) / (t.pool / totals[i].pool)).toFixed(2)])))
console.log(`${g.label}, ${S.label}, ${gamesS} games`)
rows.forEach((r, i) => console.log(key === 'horobeat' ? `  ${['0', '1', '2+'][i]} unused Ena:` : '  any time:', JSON.stringify(out[i]), ` (share of hand: ${Object.entries(r).map(([c, t]) => `${c} ${Math.round((100 * t.hand) / totals[i].hand)}%`).join(', ')})`))
console.log(key === 'horobeat' ? JSON.stringify(out) : JSON.stringify(out[0]))
