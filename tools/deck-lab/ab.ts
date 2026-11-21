// Plays each candidate deck against the same field on the same seeds, Hard bot on both sides.
import fs from 'node:fs'
import { Match } from '/home/claude/takaradeckbuilder/src/sim/engine'
import { cpuChoice } from '/home/claude/takaradeckbuilder/src/sim/ai'
import { rng } from '/home/claude/takaradeckbuilder/src/sim/search'
const [out, gamesS, simsS, seedS, fieldS, ...cands] = process.argv.slice(2)
const load = (f: string) => Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')).deck as Record<string, number>).flatMap(([id, n]) => Array(n).fill(id) as string[])
const field = fieldS.split(',').map(load), eff = { sims: +simsS, ms: 1e9, maxSteps: 600 }
const res: Record<string, { w: number; g: number; first: number; fg: number }> = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}
for (const f of cands) {
  const name = f.split('/').pop()!.replace('.json', ''); if (res[name]) continue
  const ids = load(f); if (ids.length !== 50) throw new Error(name + ' has ' + ids.length)
  let w = 0, g = 0, fw = 0, fg = 0
  for (let i = 0; i < +gamesS; i++) {
    const seat = i % 2, seed = +seedS + i * 257, opp = field[i % field.length]
    const m: any = new Match({ seed, decks: (seat ? [opp, ids] : [ids, opp]) as [string[], string[]], names: ['a', 'b'] })
    const rr = rng(seed + 3); let n = 0
    try { while (m.req && n++ < 2500) m.answer(cpuChoice(m, 'hard', rr, eff)) } catch { continue }
    if (m.s.winner == null) continue
    g++; const won = m.s.winner === seat ? 1 : 0; w += won; if (m.s.first === seat) { fg++; fw += won }
  }
  res[name] = { w, g, first: fw, fg }
  const cur = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}; cur[name] = res[name]; fs.writeFileSync(out, JSON.stringify(cur, null, 1))
  console.log(name, (w / g).toFixed(3), g)
}
