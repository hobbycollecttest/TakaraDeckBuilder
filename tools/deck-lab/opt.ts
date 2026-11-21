// Deck optimiser: hill-climbs a deck list by win rate against a gauntlet of other decks.
import fs from 'node:fs'
import { Match, DEFS as HB } from '/home/claude/takaradeckbuilder/src/sim/engine'
import { cpuChoice as hbPick } from '/home/claude/takaradeckbuilder/src/sim/ai'
import { PRACTICE } from '/home/claude/takaradeckbuilder/src/sim/decks'
import { HQ, DEFS as HQD } from '/home/claude/takaradeckbuilder/src/sim/hq/engine'
import { cpuChoice as hqPick } from '/home/claude/takaradeckbuilder/src/sim/hq/ai'
import { HQ_PRACTICE } from '/home/claude/takaradeckbuilder/src/sim/hq/decks'
import { rng } from '/home/claude/takaradeckbuilder/src/sim/search'

const arg = (k: string, d = '') => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d }
const game = arg('game'), spec = arg('pool'), out = arg('out'), iters = +arg('iters', '300'), games = +arg('games', '120')
const gauntletFile = arg('gauntlet'), avoidFile = arg('avoid'), seed0 = +arg('seed', '1'), initFile = arg('init')
const r = rng(seed0 * 7717)
const coreRaw: [string, number][] = arg('core').split(',').filter(Boolean).map((x) => { const [id, n] = x.split(':'); return [id, +n] })
let core: Record<string, number> = {}
const fillFile = arg('fill')
const policy = arg('policy', 'normal')
const hb = game === 'hb'
const RAR = ['C', 'UC', 'R', 'SR', 'DR', 'SEC']
// --- pool: one printing per card ---
type C = { id: string; key: string; event: boolean }
let pool: C[] = []
if (hb) {
  const colors = spec.split('+'); const by = new Map<string, any>()
  const rar = (id: string) => RAR.indexOf(id.split('-').pop()!.toUpperCase())
  for (const d of HB.values()) { if (!colors.includes(d.color)) continue; const h = by.get(d.name); if (!h || rar(d.id) < rar(h.id)) by.set(d.name, d) }
  pool = [...by.values()].map((d) => ({ id: d.id, key: d.name, event: false }))
} else {
  const teams = spec === 'ALL' ? null : spec.split('+'); const by = new Map<string, any>()
  for (const d of HQD.values()) {
    if (teams && !d.schools.some((s) => teams.includes(s)) && !(d.type === 'Event' && !d.schools.length)) continue
    if (d.type === 'Character' && d.rc == null && d.at == null) continue
    const h = by.get(d.no); if (!h || d.id.length < h.id.length || (d.id.length === h.id.length && d.id < h.id)) by.set(d.no, d)
  }
  pool = [...by.values()].map((d) => ({ id: d.id, key: d.no, event: d.type === 'Event' }))
}
core = Object.fromEntries(coreRaw.map(([k, n]) => { const c = pool.find((c) => c.id === k || c.key === k); if (!c) throw new Error('core card not in pool: ' + k); return [c.id, n] }))
const SIZE = hb ? 50 : 40, MAXC = hb ? 4 : +arg('maxc', '10')
type Deck = Record<string, number>
const expand = (d: Deck) => Object.entries(d).flatMap(([id, n]) => Array(n).fill(id) as string[])
const fromIds = (ids: string[]) => { const d: Deck = {}; for (const id of ids) d[id] = (d[id] || 0) + 1; return d }
const legal = (d: Deck) => {
  let n = 0, ev = 0
  for (const [id, c] of Object.entries(d)) { if (c > MAXC) return false; n += c; if (!hb && HQD.get(id)!.type === 'Event') ev += c }
  return n === SIZE && ev <= 8
}
// --- starting deck ---
let cur: Deck
if (initFile) cur = JSON.parse(fs.readFileSync(initFile, 'utf8')).deck
else {
  const inPool = new Set(pool.map((c) => c.id))
  const base = fillFile ? Object.entries(JSON.parse(fs.readFileSync(fillFile, 'utf8')).deck as Record<string, number>).flatMap(([id, n]) => Array(n).fill(id) as string[]) : hb ? PRACTICE.find((p) => spec.split('+')[0] === p.color)!.ids : (HQ_PRACTICE.find((p) => p.team === spec.split('+')[0]) || HQ_PRACTICE[0]).ids
  const coreN = Object.values(core).reduce((a, b) => a + b, 0)
  const coreEv = !hb && Object.keys(core).some((id) => HQD.get(id)?.type === 'Event')
  const ids = base.filter((id) => inPool.has(id) && !core[id] && !(coreEv && HQD.get(id)?.type === 'Event')).slice(0, Math.max(0, (hb ? 50 : 40) - coreN)); const d = fromIds(ids)
  for (const [id, n] of Object.entries(core)) d[id] = n
  for (const id of Object.keys(d)) d[id] = Math.min(MAXC, d[id])
  let n = Object.values(d).reduce((a, b) => a + b, 0), guard = 0
  while (n < SIZE && guard++ < 5000) { const c = pool[Math.floor(r() * pool.length)]; if ((d[c.id] || 0) < MAXC && (!c.event || Object.entries(d).filter(([i]) => HQD.get(i)?.type === 'Event').reduce((a, [, x]) => a + x, 0) < 8)) { d[c.id] = (d[c.id] || 0) + 1; n++ } }
  cur = d
}
if (!legal(cur)) throw new Error('bad start deck')
const gauntlet: string[][] = gauntletFile
  ? gauntletFile.split(',').map((f) => expand(JSON.parse(fs.readFileSync(f, 'utf8')).deck))
  : (hb ? PRACTICE : HQ_PRACTICE).map((p) => p.ids)
const avoid: Deck | null = avoidFile ? JSON.parse(fs.readFileSync(avoidFile, 'utf8')).deck : null
const overlap = (d: Deck) => (avoid ? Object.entries(d).reduce((a, [id, n]) => a + Math.min(n, avoid[id] || 0), 0) : 0)

function play(a: string[], b: string[], seed: number, aSeat: number) {
  const setup = { seed, decks: (aSeat ? [b, a] : [a, b]) as [string[], string[]], names: ['a', 'b'] as [string, string] }
  const m: any = hb ? new Match(setup) : new HQ(setup); const pick: any = hb ? hbPick : hqPick
  const rr = rng(seed + 5); let n = 0
  while (m.req && n++ < 2500) m.answer(pick(m, policy, rr))
  return m.s.winner === aSeat ? 1 : m.s.winner == null ? 0.5 : 0
}
function fitness(d: Deck, round: number) {
  const ids = expand(d); let w = 0
  for (let i = 0; i < games; i++) w += play(ids, gauntlet[i % gauntlet.length], round * 100003 + Math.floor(i / 2) * 31 + 7, i % 2)
  const over = Math.max(0, overlap(d) - SIZE * 0.4)
  return w / games - over * 0.02
}
let round = 1, curFit = fitness(cur, round), accepted = 0
for (let it = 0; it < iters; it++) {
  if (it % 40 === 39) { round++; curFit = fitness(cur, round) }
  const cand: Deck = { ...cur }
  const k = r() < 0.5 ? 1 : r() < 0.7 ? 2 : 4
  const have = Object.keys(cand); const outId = have[Math.floor(r() * have.length)]
  const take = Math.min(k, cand[outId]); cand[outId] -= take; if (!cand[outId]) delete cand[outId]
  let left = take, guard = 0
  const inC = pool[Math.floor(r() * pool.length)]
  while (left > 0 && guard++ < 50) { const c = guard < 8 ? inC : pool[Math.floor(r() * pool.length)]; if (c.id !== outId && (cand[c.id] || 0) < MAXC) { cand[c.id] = (cand[c.id] || 0) + 1; left-- } }
  if (left || !legal(cand) || (core[outId] && (cand[outId] || 0) < core[outId])) continue
  const f = fitness(cand, round)
  if (f > curFit + 0.004) { cur = cand; curFit = f; accepted++ }
}
// final score on fresh seeds
let w = 0; const ids = expand(cur); const N = 400
for (let i = 0; i < N; i++) w += play(ids, gauntlet[i % gauntlet.length], 990000 + Math.floor(i / 2), i % 2)
fs.writeFileSync(out, JSON.stringify({ game, spec, score: w / N, accepted, deck: cur }, null, 1))
console.log(out, 'score', (w / N).toFixed(3), 'accepted', accepted)
