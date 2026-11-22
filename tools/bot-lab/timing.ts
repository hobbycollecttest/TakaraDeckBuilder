// How long does one decision take? (On this machine; a phone is several times slower, which is what the time cap is for.)
//   npx tsx tools/bot-lab/timing.ts horobeat hard:sims=200 6
import { decksFor, game, playMatch, seat } from './lab'
const [gameName, who = 'hard', gamesS = '6'] = process.argv.slice(2)
const g = game(gameName); const decks = decksFor(gameName); const S = seat(who); const N = seat('normal')
const times: number[] = []
for (let i = 0; i < +gamesS; i++) {
  const m0 = { seed: 4200 + i * 17, decks: [decks[i % decks.length].ids, decks[(i * 3 + 1) % decks.length].ids] as [string[], string[]], names: ['A', 'B'] as [string, string] }
  const timed = { ...S }
  const orig = g.choose
  const wrapped = { ...g, choose: (m: unknown, l: never, r: never, e: never) => { const multi = (m as { req: { opts: unknown[]; p: number } }).req; const t = performance.now(); const c = orig(m, l, r, e); if (multi.p === 0 && multi.opts.length > 1) times.push(performance.now() - t); return c } }
  playMatch(wrapped, m0, [timed, N])
}
times.sort((a, b) => a - b)
const q = (f: number) => times[Math.min(times.length - 1, Math.floor(times.length * f))].toFixed(0)
console.log(`${g.label} ${S.label}: ${times.length} decisions, typical ${q(0.5)} ms, slow ones ${q(0.9)} ms, slowest ${q(0.999)} ms`)
