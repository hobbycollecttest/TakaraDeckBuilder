import fs from 'node:fs'
import { Match } from '/home/claude/takaradeckbuilder/src/sim/engine'
import { cpuChoice as hbPick } from '/home/claude/takaradeckbuilder/src/sim/ai'
import { HQ } from '/home/claude/takaradeckbuilder/src/sim/hq/engine'
import { cpuChoice as hqPick } from '/home/claude/takaradeckbuilder/src/sim/hq/ai'
import { rng } from '/home/claude/takaradeckbuilder/src/sim/search'
const [game, out, gamesPer, sims, ...files] = process.argv.slice(2)
const hb = game === 'hb'; const eff = { sims: +sims, ms: 1e9, maxSteps: 600 }
const decks = files.map((f) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { name: (j.name ? 'PUB ' + j.name : f.split('/').pop()!.replace('.json', '')), ids: Object.entries(j.deck as Record<string, number>).flatMap(([id, n]) => Array(n).fill(id) as string[]) } })
const W = decks.map(() => decks.map(() => 0)), G = decks.map(() => decks.map(() => 0))
const save = () => {
  const rows = decks.map((d, i) => ({ name: d.name, w: W[i].reduce((a, b) => a + b, 0), g: G[i].reduce((a, b) => a + b, 0), vs: Object.fromEntries(decks.map((e, j) => [e.name, G[i][j] ? +(W[i][j] / G[i][j]).toFixed(2) : null])) }))
  fs.writeFileSync(out, JSON.stringify(rows.sort((a, b) => b.w / Math.max(1, b.g) - a.w / Math.max(1, a.g)), null, 1))
}
const K0 = +(process.env.K0 || 0)
for (let k = K0; k < K0 + +gamesPer; k++) {
  for (let i = 0; i < decks.length; i++) for (let j = i + 1; j < decks.length; j++) {
    const aSeat = k % 2; const seed = 7000 + k * 977 + i * 31 + j
    const setup = { seed, decks: (aSeat ? [decks[j].ids, decks[i].ids] : [decks[i].ids, decks[j].ids]) as [string[], string[]], names: ['a', 'b'] as [string, string] }
    const m: any = hb ? new Match(setup) : new HQ(setup); const pick: any = hb ? hbPick : hqPick; const r = rng(seed); let n = 0
    try { while (m.req && n++ < 2500) m.answer(pick(m, 'hard', r, eff)) } catch { continue }
    if (m.s.winner == null) continue
    const iWon = m.s.winner === aSeat
    W[iWon ? i : j][iWon ? j : i]++; G[i][j]++; G[j][i]++
  }
  save()
}
