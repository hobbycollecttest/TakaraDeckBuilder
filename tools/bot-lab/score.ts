// Card scores: what is one copy of a card worth in this deck?
//   npx tsx tools/bot-lab/score.ts horobeat decks/horobeat/ecoeco-raiga-swarm-red.json --pilot=normal --games=4000 --out=results/score-red.json
// Flags: --colors=Red,Green (also score cards the deck does not run; default is the deck's own colors),
// --only=deck (just the cards in the deck), --cards=id,id (just these), --seed=1, --field=a.json,b.json
//
// Judging a card by the win rate of games it shows up in is misleading: the other 49 cards carry it.
// So each card is measured against a plain card in the very same spot of the very same game:
//   1. Deal a game. Pick one spot the deck's owner will actually see: the opening hand, a Heart, or one
//      of the next 20 cards it will draw.
//   2. Play the game with the card under test in that spot, then again with a plain 2-cost Horobeat of
//      the deck's color there instead. Same shuffle, same opponent, same everything else.
//   3. The score is how many points of win rate the card adds over the plain card, each time it shows up.
// The shuffle goes by position, so until that spot comes up the two games are identical: nothing else
// in the deck can carry the result. Scores are split by where the card showed up and by who went first.
import fs from 'node:fs'
import path from 'node:path'
import { DEFS } from '../../src/sim/engine'
import { decksFor, game, loadDeck, playMatch, rng, seat } from './lab'

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const [gameName, deckFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (gameName !== 'horobeat' && gameName !== 'hb') throw new Error('Card scores are set up for HORO-BEAT only so far.')
const g = game(gameName)
const deck = loadDeck(deckFile)
const pilot = seat(flags.pilot || 'normal')
const N = +(flags.games || 4000)
const out = flags.out || `results/score-${path.basename(deckFile, '.json')}.json`
const field = decksFor(gameName, flags.field ? flags.field.split(',') : []).filter((d) => path.resolve(d.file) !== path.resolve(deck.file))
const seed0 = 30_000_000 + +(flags.seed || 1) * 1_000_003

const nameOf = (id: string) => { const d = DEFS.get(id)! as { jp?: string; name: string }; return d.jp || d.name }
const inDeck = new Map<string, number>()
for (const id of deck.ids) inDeck.set(id, (inDeck.get(id) || 0) + 1)
const tally: Record<string, number> = {}
for (const id of deck.ids) tally[DEFS.get(id)!.color] = (tally[DEFS.get(id)!.color] || 0) + 1
const main = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]
// The yardstick: a 2-cost, 4000 power Horobeat with no effect and no Boost. Every color has one.
const plain = [...DEFS.values()].find((d) => d.color === main && d.type === 'Horobeat' && d.cost === 2 && d.power === 4000 && !d.boost && !(d.effect || '').trim())
if (!plain) throw new Error(`No plain card found for ${main}`)
const colors = new Set((flags.colors ? flags.colors.split(',') : Object.keys(tally)) as string[])
const printing = new Map<string, string>()
for (const id of inDeck.keys()) printing.set(nameOf(id), id)
if (flags.only !== 'deck') for (const d of DEFS.values()) if (colors.has(d.color) && !printing.has(nameOf(d.id))) printing.set(nameOf(d.id), d.id)
let cards = [...printing.values()].filter((id) => id !== plain.id)
if (flags.cards) cards = flags.cards.split(',')

type Zone = 'hand' | 'heart' | 'early' | 'late'
type Cell = { n: number; sum: number; sq: number }
const cell = (): Cell => ({ n: 0, sum: 0, sq: 0 })
const add = (c: Cell, d: number) => { c.n++; c.sum += d; c.sq += d * d }
const points = (c: Cell) => (c.n ? (100 * c.sum) / c.n : 0)
const margin = (c: Cell) => (c.n > 1 ? 100 * 2 * Math.sqrt(Math.max(1e-9, c.sq / c.n - (c.sum / c.n) ** 2) / c.n) : 99)

/** Where each of the deck's 50 spots ends up once this game is dealt: the spots its owner will see. */
function spots(seed: number, mine: 0 | 1, opp: string[]) {
  const m = g.create({ seed, decks: mine ? [opp, deck.ids] : [deck.ids, opp], names: ['A', 'B'] })
  const P = m.s.ps[mine]
  const off = mine ? opp.length : 0
  const seen: { slot: number; zone: Zone }[] = []
  // At this point only the opening hand is dealt. The next 5 cards down become the Hearts, then come the draws.
  // (A redraw reshuffles, so after one the labels are only roughly right; the comparison itself stays exact.)
  for (const u of P.hand) seen.push({ slot: u - off, zone: 'hand' })
  const top = [...P.deck].reverse()
  top.slice(0, 25).forEach((u: number, k: number) => seen.push({ slot: u - off, zone: k < 5 ? 'heart' : k < 13 ? 'early' : 'late' }))
  return seen
}

const t0 = Date.now()
const rows: { id: string; all: Cell; zone: Record<Zone, Cell>; first: Cell; second: Cell }[] = []
for (const id of cards) {
  const row = { id, all: cell(), zone: { hand: cell(), heart: cell(), early: cell(), late: cell() }, first: cell(), second: cell() }
  const r = rng(seed0 + 17)
  const own = deck.ids.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0)
  for (let i = 0; i < N; i++) {
    const mine = (i % 2) as 0 | 1
    const opp = field[i % field.length].ids
    const seed = seed0 + i * 257
    const seen = spots(seed, mine, opp)
    const { slot, zone } = seen[Math.floor(r() * seen.length)]
    // Put the card under test in the chosen spot. A card the deck already runs is moved there from one of
    // its own spots, so the deck keeps its real list; a card it does not run takes the spot over.
    const withCard = [...deck.ids]
    if (own.length && withCard[slot] !== id) { const from = own[Math.floor(r() * own.length)]; withCard[from] = withCard[slot] }
    withCard[slot] = id
    const withPlain = [...withCard]
    withPlain[slot] = plain.id
    const res = [withCard, withPlain].map((ids) => playMatch(g, { seed, decks: mine ? [opp, ids] : [ids, opp], names: ['A', 'B'] }, [pilot, pilot]))
    if (res[0].winner == null || res[1].winner == null) continue
    const d = (res[0].winner === mine ? 1 : 0) - (res[1].winner === mine ? 1 : 0)
    add(row.all, d)
    add(row.zone[zone], d)
    add(res[0].first === mine ? row.first : row.second, d)
  }
  rows.push(row)
  const d = DEFS.get(id)!
  console.error(`${String(rows.length).padStart(3)}/${cards.length} ${d.name.slice(0, 34).padEnd(34)} ${points(row.all) >= 0 ? '+' : ''}${points(row.all).toFixed(1)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}

rows.sort((a, b) => points(b.all) - points(a.all))
const f = (c: Cell) => `${points(c) >= 0 ? '+' : ''}${points(c).toFixed(1)}`.padStart(6)
console.log(`Card scores for ${deck.name}, piloted by ${pilot.label}, ${N} deals per card against ${field.length} decks.`)
console.log(`Points of win rate one copy adds each time it shows up, compared with a plain card in the same spot (${plain.name}, ${main} 2-cost 4000).\n`)
console.log(`${'In deck'.padEnd(8)}${'Card'.padEnd(44)}${'Score'.padStart(6)}  +/-   ${'Hand'.padStart(6)}${'Heart'.padStart(6)}${'Early'.padStart(6)}${'Late'.padStart(6)}  ${'First'.padStart(6)}${'Second'.padStart(7)}`)
for (const row of rows) {
  const d = DEFS.get(row.id)!
  const tag = `${d.name} (${d.color[0]} ${d.type === 'Waza' ? 'W' : ''}${d.cost})`.slice(0, 43)
  console.log(`${(inDeck.get(row.id) ? `${inDeck.get(row.id)}x` : '').padEnd(8)}${tag.padEnd(44)}${f(row.all)}  ${margin(row.all).toFixed(1).padStart(4)}  ${f(row.zone.hand)}${f(row.zone.heart)}${f(row.zone.early)}${f(row.zone.late)}  ${f(row.first)}${f(row.second).padStart(7)}`)
}
fs.writeFileSync(out, JSON.stringify({ deck: deck.name, from: path.basename(deck.file), pilot: pilot.label, deals: N, plain: plain.id, scores: rows.map((x) => ({ id: x.id, name: DEFS.get(x.id)!.name, inDeck: inDeck.get(x.id) || 0, score: +points(x.all).toFixed(2), margin: +margin(x.all).toFixed(2), hand: +points(x.zone.hand).toFixed(1), heart: +points(x.zone.heart).toFixed(1), early: +points(x.zone.early).toFixed(1), late: +points(x.zone.late).toFixed(1), first: +points(x.first).toFixed(1), second: +points(x.second).toFixed(1) })) }, null, 1))
console.log(`\nSaved to ${out}`)
