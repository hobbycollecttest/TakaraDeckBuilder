// Per-card results for one deck against a field: win rate when the card was in the opening hand, and when it was seen at all.
import fs from 'node:fs'
import { Match, DEFS } from '../../src/sim/engine'
import { cpuChoice } from '../../src/sim/ai'
import { rng } from '../../src/sim/search'
const [deckFile, out, gamesS, simsS, ...field] = process.argv.slice(2)
const load = (f: string) => Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')).deck as Record<string, number>).flatMap(([id, n]) => Array(n).fill(id) as string[])
const me = load(deckFile), opps = field.map(load), eff = { sims: +simsS, ms: 1e9, maxSteps: 600 }
const st: Record<string, { og: number; ow: number; sg: number; sw: number }> = {}
let W = 0, G = 0, rounds = 0, fw = 0, fg = 0
for (let i = 0; i < +gamesS; i++) {
  const seat = i % 2, seed = 424200 + i * 131, opp = opps[i % opps.length]
  const m: any = new Match({ seed, decks: (seat ? [opp, me] : [me, opp]) as [string[], string[]], names: ['a', 'b'] })
  const r = rng(seed); let n = 0, open: number[] | null = null
  try { while (m.req && n++ < 2500) { if (!open && m.s.round >= 1) open = [...m.s.ps[seat].hand]; m.answer(cpuChoice(m, 'hard', r, eff)) } } catch { continue }
  if (m.s.winner == null || !open) continue
  const won = m.s.winner === seat ? 1 : 0; W += won; G++; rounds += m.s.round
  if (m.s.first === seat) { fg++; fw += won }
  const p = m.s.ps[seat]; const unseen = new Set<number>([...p.deck, ...p.hearts.filter((h: any) => h.down !== false).map((h: any) => h.uid)])
  const mine = new Set<number>([...p.deck, ...p.hand, ...p.hearts.map((h: any) => h.uid), ...p.check, ...p.grave, ...p.ena.map((e: any) => e.uid), ...p.lines.flatMap((l: any) => (l ? l.cards : [])), ...p.waza.flat().map((w: any) => w.uid)])
  const seen = new Set<string>(), op = new Set<string>(open.map((u) => m.s.cards[u]))
  for (const u of mine) if (!unseen.has(u)) seen.add(m.s.cards[u])
  for (const id of new Set(me)) { const s = (st[id] ||= { og: 0, ow: 0, sg: 0, sw: 0 }); if (op.has(id)) { s.og++; s.ow += won } if (seen.has(id)) { s.sg++; s.sw += won } }
}
const rows = Object.entries(st).map(([id, s]) => { const d = DEFS.get(id)!; return { id, name: d.name, n: me.filter((x) => x === id).length, cost: d.cost, type: d.type, open: s.og ? +(s.ow / s.og).toFixed(2) : null, og: s.og, notOpen: +((W - s.ow) / Math.max(1, G - s.og)).toFixed(2), seen: s.sg ? +(s.sw / s.sg).toFixed(2) : null, sg: s.sg, notSeen: G - s.sg ? +((W - s.sw) / (G - s.sg)).toFixed(2) : null } })
fs.writeFileSync(out, JSON.stringify({ wr: +(W / G).toFixed(3), games: G, avgRounds: +(rounds / G).toFixed(2), firstWr: +(fw / Math.max(1, fg)).toFixed(2), secondWr: +((W - fw) / Math.max(1, G - fg)).toFixed(2), rows }, null, 1))
console.log(out, (W / G).toFixed(3))
