// Improves one deck by trying card swaps, with the Hard bot (fixed thinking budget) piloting both sides on fixed seeds.
import fs from 'node:fs'
import { Match, DEFS } from '/home/claude/takaradeckbuilder/src/sim/engine'
import { cpuChoice } from '/home/claude/takaradeckbuilder/src/sim/ai'
import { rng } from '/home/claude/takaradeckbuilder/src/sim/search'
const arg = (k: string, d = '') => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d }
const load = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')).deck as Record<string, number>
const expand = (d: Record<string, number>) => Object.entries(d).flatMap(([id, n]) => Array(n).fill(id) as string[])
const colors = arg('pool').split('+'), out = arg('out'), minutes = +arg('minutes', '15'), eff = { sims: +arg('sims', '12'), ms: 1e9, maxSteps: 600 }
const field = arg('field').split(',').map((f) => expand(load(f))); const r = rng(+arg('seed', '1') * 991)
const keep = new Set(arg('keep').split(',').filter(Boolean))
const RAR = ['C', 'UC', 'R', 'SR', 'DR', 'SEC']; const rar = (id: string) => RAR.indexOf(id.split('-').pop()!.toUpperCase())
const by = new Map<string, any>(); for (const d of DEFS.values()) { if (!colors.includes(d.color)) continue; const h = by.get(d.name); if (!h || rar(d.id) < rar(h.id)) by.set(d.name, d) }
const pool = [...by.values()].map((d) => d.id as string)
let cur = load(arg('init'))
// same card under one printing
{ const n: Record<string, number> = {}; for (const [id, c] of Object.entries(cur)) { const k = by.get(DEFS.get(id)!.name)?.id || id; n[k] = (n[k] || 0) + c } cur = n }
const S1 = 32, S2 = 64
function play(ids: string[], i: number) {
  const seat = i % 2, seed = 880000 + i * 257, opp = field[i % field.length]
  const m: any = new Match({ seed, decks: (seat ? [opp, ids] : [ids, opp]) as [string[], string[]], names: ['a', 'b'] })
  const rr = rng(seed + 3); let n = 0
  try { while (m.req && n++ < 2500) m.answer(cpuChoice(m, 'hard', rr, eff)) } catch { return 0.5 }
  return m.s.winner === seat ? 1 : m.s.winner == null ? 0.5 : 0
}
const score = (d: Record<string, number>, from: number, to: number) => { const ids = expand(d); let w = 0; for (let i = from; i < to; i++) w += play(ids, i); return w }
let c1 = score(cur, 0, S1), c2 = score(cur, S1, S1 + S2); const start = Date.now(); let tried = 0, acc = 0; const log: string[] = []
console.log('start', ((c1 + c2) / (S1 + S2)).toFixed(3))
while (Date.now() - start < minutes * 60000) {
  const cand = { ...cur }; const have = Object.keys(cand).filter((id) => !keep.has(id)); const outId = have[Math.floor(r() * have.length)]
  const k = Math.min(cand[outId], r() < 0.45 ? 1 : r() < 0.6 ? 2 : 4); const inId = pool[Math.floor(r() * pool.length)]
  if (inId === outId || (cand[inId] || 0) + k > 4) continue
  cand[outId] -= k; if (!cand[outId]) delete cand[outId]; cand[inId] = (cand[inId] || 0) + k
  tried++
  const a = score(cand, 0, S1); if (a - c1 < 2.5) continue
  const b = score(cand, S1, S1 + S2); if (a + b - c1 - c2 < 5) continue
  log.push(`-${k} ${DEFS.get(outId)!.name} +${k} ${DEFS.get(inId)!.name}  ${((c1 + c2) / 96).toFixed(2)} -> ${((a + b) / 96).toFixed(2)}`); console.log(log[log.length - 1])
  cur = cand; c1 = a; c2 = b; acc++
  fs.writeFileSync(out, JSON.stringify({ score: (c1 + c2) / 96, tried, acc, log, deck: cur }, null, 1))
}
fs.writeFileSync(out, JSON.stringify({ score: (c1 + c2) / 96, tried, acc, log, deck: cur }, null, 1))
console.log(out, 'tried', tried, 'accepted', acc, ((c1 + c2) / 96).toFixed(3))
