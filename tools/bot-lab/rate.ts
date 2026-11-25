// Card ratings on paper: every HORO-BEAT card rated without playing a single game.
//   npx tsx tools/bot-lab/rate.ts            (writes results/ratings-horobeat.json and .csv, prints the table)
//
// A card's rating is four parts added up, all in the same unit (1 point is about 1000 Power):
//   Stats    its Power against the benchmark card of its type and level (benchmarks/horobeat.json)
//   Boost    its Boost against the benchmark's Boost (2000 Boost counts as 1 point: it is only used from hand)
//   Effect   what its text does, from the list of rules below (each rule is one line: what it matches, its points)
//   Synergy  how many cards of the same color it works with (what it needs is available; other cards need it)
// Synergy is NOT part of a card's rating: it only counts inside a deck that has the partner cards (Jeff, 2026-11-25).
// It is still worked out here and saved beside the rating, for the deck builder to use.
// The points in RULES and the shares in WHEN are Jeff's (HORO-BEAT Effect Scores sheet, 2026-11-25). The synergy weights are judgement calls, written down so they can be
// argued with and changed. Nothing here is measured. For a measured score, see score.ts.
import fs from 'node:fs'
import path from 'node:path'
import raw from '../../src/horobeat.json' with { type: 'json' }
import { HERE } from './lab'

type Card = { id: string; name: string; jp?: string; type: 'Horobeat' | 'Waza'; color: string; cost: number; power: number; boost: number; trigger: string; tribe: string; effect: string }
const BENCH = JSON.parse(fs.readFileSync(path.join(HERE, 'benchmarks', 'horobeat.json'), 'utf8')) as Record<string, Record<string, { plain: number; boosted: number | null }>>
const seen = new Set<string>()
const cards: Card[] = (raw as unknown as (Card & { cost: number | null; power: number | null; boost: number | null })[])
  .filter((c) => { const k = c.jp || c.name; if (seen.has(k)) return false; seen.add(k); return true })
  .map((c) => ({ ...c, cost: c.cost ?? 0, power: c.power ?? 0, boost: c.boost ?? 0, effect: (c.effect || '').replace(/\s+/g, ' ').trim() }))

// ---- Effect rules. The first rule that matches a sentence scores it. `x` is a number captured from the text.
type Rule = { re: RegExp; what: string; pts: (x: number, text: string) => number; on?: 'Horobeat' | 'Waza' }
/** How often a condition is met, as a share of the full value. */
const WHEN: [RegExp, number, string][] = [
  [/lines 2–5/, 0.75, 'in lines 2 to 5'], [/lines 3–5/, 0.25, 'in lines 3 to 5'], [/lines 1–2 is 5 or more/, 0.25, '5+ cards under lines 1 and 2'], [/lines 1–2 is 3 or more/, 0.5, '3+ cards under lines 1 and 2'], [/in lines 1–2/, 0.5, 'in lines 1 to 2'],
  [/is not downed/, 0.5, 'while not downed'], [/4 or more (of your |red )?Horobeats/, 0.25, 'with 4+ Horobeats'], [/Boost has been used/, 0.25, 'when Boosted'], [/If this Horobeat is downed/, 0.5, 'while downed'],
  [/opposing Horobeat is using a Waza/, 0.5, 'when the opponent uses a Waza'], [/is using a Waza/, 0.25, 'when using a Waza'], [/8 or more cards in your Ena/, 0.25, 'with 8+ Ena'], [/6 or more cards in your hand/, 0.25, 'with 6+ cards in hand'],
  [/2 or more cards under this/, 0.25, 'with 2+ cards under it'], [/downed Heart/, 0.5, 'with a downed Heart'], [/If you go first/, 0.5, 'when going first'], [/greater than the number of cards under/, 0.25, 'with the taller stack'], [/no cards beneath/, 0.5, 'with nothing under it'],
]
const when = (t: string) => WHEN.find(([re]) => re.test(t))
const RULES: Rule[] = [
  { re: /gets \+(\d+) Power and gains Double Damage/, what: 'Power bonus and Double Damage', pts: (x) => x / 1000 + 2 },
  { re: /it gains Double Damage/, what: 'Double Damage', pts: () => 2 },
  { re: /^Double Damage/, what: 'Double Damage', pts: () => 2 },
  { re: /^(\d) Barrier/, what: 'Barrier', pts: (x) => x },
  { re: /deal the amount of damage reduced/, what: 'Returns blocked damage', pts: () => 1.5 },
  { re: /cannot be destroyed/, what: 'Cannot be destroyed', pts: () => 1.5 },
  { re: /You cannot Overbeat onto this/, what: 'Cannot be Overbeat onto', pts: () => -1.5 },
  { re: /cannot be played from your hand via Overbeat/, what: 'Cannot be played by Overbeat', pts: () => -1 },
  { re: /cannot be played unless/, what: 'Needs a 4000+ neighbor to be played', pts: () => -1 },
  { re: /its cost is 1 higher/, what: 'Counts as 1 cost higher in a line (cheaper to Overbeat onto)', pts: () => 1 },
  { re: /its cost is 1 lower/, what: 'Counts as 1 cost lower in a line', pts: () => -1 },
  { re: /This Horobeat cannot use Waza/, what: 'Cannot use Waza', pts: () => -1.5 },
  { re: /neither can have their Power increased/, what: 'No Waza or Boost for either side', pts: () => 0.5 },
  { re: /its Power cannot be increased by Waza or Boost/, what: 'Cannot be powered up', pts: () => -2 },
  { re: /opposing Horobeat cannot use Boost/, what: 'Opponent cannot Boost', pts: () => 2 },
  { re: /you may play 1 red Horobeat with a cost of 2 or less/, what: 'Plays a 2-cost for free', pts: () => 2 },
  { re: /reveal a Horobeat with a cost of 7 or more from your hand\. If you do, draw 1/, what: 'Draws on entering if you hold a 7+ cost', pts: () => 0.5 },
  { re: /enters play, draw (\d)/, what: 'Draws on entering', pts: (x) => x },
  { re: /enters play, if there are no cards beneath it, draw (\d)/, what: 'Draws on entering', pts: (x) => x },
  { re: /recover the opposing Horobeat and draw 1/, what: 'Draws but recovers the opponent', pts: () => 0 },
  { re: /wins a battle, draw (\d)/, what: 'Draws on a win', pts: (x) => x },
  { re: /wins a battle, if it is in lines 2–5, draw (\d)/, what: 'Draws on a win', pts: (x) => x },
  { re: /is destroyed, draw (\d)/, what: 'Draws when destroyed', pts: (x) => 0.5 * x },
  { re: /is downed, draw (\d)/, what: 'Draws when downed', pts: (x) => 0.5 * x },
  { re: /use Boost on this Horobeat, draw 1/, what: 'Draws when Boosted', pts: () => 0.5 },
  { re: /Overbeat onto this Horobeat.*draw 1/, what: 'Draws when Overbeat onto', pts: () => 1 },
  { re: /Return it to unused, then recover this/, what: 'Recovers itself and an Ena after battle', pts: () => 2 },
  { re: /battle ends, recover this Horobeat/, what: 'Recovers itself after battle', pts: () => 1 },
  { re: /battle ends, choose 1 of your Horobeats and recover/, what: 'Recovers any Horobeat after battle', pts: () => 1.5 },
  { re: /enters play, choose 1 of your Horobeats and recover/, what: 'Recovers a Horobeat on entering', pts: () => 1 },
  { re: /loses a battle, it takes no damage/, what: 'Takes no damage when it loses', pts: () => 1 },
  { re: /swap it with the Horobeat directly opposing/, what: 'Chooses its opponent', pts: () => 2 },
  { re: /swap (their )?positions/, what: 'Swaps places with your own Horobeat', pts: () => 0.5 },
  { re: /move to that line/, what: 'Can move to an open line', pts: () => 0.5 },
  { re: /choose one of your Ena and place it in the graveyard/, what: 'Costs an Ena for good', pts: () => -2 },
  { re: /deal 1 damage to this Horobeat/, what: 'Damages itself after battle', pts: () => -2 },
  { re: /is downed, choose 1 of your Ena and return it to unused/, what: 'Frees an Ena when downed', pts: () => 0.5 },
  { re: /look at the top 5 cards/, what: 'Finds a Waza', pts: () => 1 },
  { re: /place this card in your Ena unused/, what: 'Becomes Ena when destroyed', pts: () => 1.5 },
  { re: /each player recovers Hearts/, what: 'Both players recover Hearts', pts: () => 0.5 },
  { re: /each player places the top card of their deck into their Ena/, what: 'Both players gain an Ena', pts: () => 0.5 },
  { re: /Waza with a cost of 1 in the graveyard and return it to your hand/, what: 'Gets a 1-cost Waza back every turn', pts: () => 2 },
  { re: /each player may choose 1 Waza from their graveyard/, what: 'Both players turn a Waza into Ena', pts: () => 0.5 },
  { re: /is downed, return this card to your hand/, what: 'Returns to hand when downed', pts: () => -2 },
  { re: /second Waza.*return the top card/, what: 'Bounces the opposing Horobeat', pts: () => 2 },
  { re: /down the top card of your deck and add it to your Hearts/, what: 'Heals a Heart on a win', pts: () => 1.5 },
  { re: /Blue Waza with a cost of 3 or less in your Ena and use it/, what: 'Uses a Waza from Ena for free', pts: () => 1 },
  { re: /turn all your Ena unused/, what: 'Refreshes Ena after battle', pts: () => 2 },
  { re: /discard it\. If you do, choose 1 of your Ena/, what: 'Trades a Waza for an Ena', pts: () => 0.5 },
  { re: /use that card in the next line/, what: 'Reuses a 1-cost Waza in the next line', pts: () => 1.5 },
  { re: /look at the top card of your deck/, what: 'Looks at the top card', pts: () => 0.5 },
  { re: /place it under the bottom of that Horobeat/, what: 'Tucks a card under a Horobeat and draws', pts: () => 0.5 },
  { re: /destroy the opposing Horobeat/, what: 'Destroys what it beats by double', pts: () => 2 },
  { re: /your opponent chooses 1 card from their hand and discards it/, what: 'Opponent discards', pts: () => 2 },
  { re: /When this battle is won, you draw 1/, what: 'Draws if the battle is won', pts: () => 1 },
  { re: /deals \+1 damage/, what: '+1 damage on a win', pts: () => 1.5 },
  { re: /deal 1 damage to the opposing player/, what: 'Deals 1 damage outright', pts: () => 2 },
  { re: /When this Waza is used, draw 1/, what: 'Draws when used', pts: () => 1 },
  { re: /recover this Horobeat/, what: 'Recovers the Horobeat', pts: () => 1, on: 'Waza' },
  { re: /Only a Horobeat in lines/, what: 'Only usable in some lines', pts: () => -0.5 },
  { re: /Only a Horobeat with 2 or more cards underneath/, what: 'Needs 2+ cards under the Horobeat', pts: () => -1 },
  { re: /Only a Horobeat with 1 or more cards underneath/, what: 'Needs a card under the Horobeat', pts: () => -0.5 },
  { re: /Only a Horobeat with 1 or fewer cards underneath/, what: 'Not usable on tall stacks', pts: () => -1 },
  { re: /can only be used when you have 4 or more/, what: 'Needs 4+ Horobeats', pts: () => -1 },
  { re: /already used another Waza/, what: 'Needs another Waza used first', pts: () => -1 },
  { re: /loses its effects/, what: 'Blanks the opposing Horobeat', pts: () => 1.5 },
  { re: /return this card to your hand/, what: 'Returns to hand after battle', pts: () => 2 },
  { re: /battle ends, choose 1 of your Ena and return it to unused/, what: 'Pays for itself after battle', pts: () => 2 },
  { re: /gets \+(\d+) Power/, what: 'Power bonus', pts: (x) => x / 1000 },
]

type Part = { what: string; pts: number }
function effectParts(c: Card): Part[] {
  const out: Part[] = []
  for (const sentence of c.effect.split('●').map((s) => s.trim()).filter(Boolean)) {
    // "Ena Reading Red 3 (...) • effect" and "Resonance: Raiga (...) • effect • effect": the inner effects, discounted.
    const gate = /^Ena Reading \w+ 3/.test(sentence) ? { share: 1, note: ' (Ena Reading 3)' } : /^Resonance: (\w+)/.test(sentence) ? { share: 0.75, note: ` (Resonance: ${/^Resonance: (\w+)/.exec(sentence)![1]})` } : null
    const pieces = gate ? sentence.split('•').slice(1).map((s) => s.trim()) : [sentence]
    for (const piece of pieces) {
      // Reminder text in brackets explains a keyword; it is not a second effect.
      const text = piece.replace(/\((?:If this Horobeat wins|When a Horobeat with Double Damage|When you lose a battle|When this Horobeat is downed and would|Without paying|Does not trigger|Even if Boost|Triggers even|Your Hearts still|Cards beneath|Waza cannot be used|This cannot be used|If a trigger|Barrier and effects)[^)]*\)/g, '').trim()
      const rule = RULES.find((r) => r.re.test(text) && (!r.on || r.on === c.type))
      if (!rule) { out.push({ what: `NOT RATED: ${text}`, pts: 0 }); continue }
      const x = +(rule.re.exec(text)?.[1] ?? 0)
      const cond = when(text)
      const share = (gate?.share ?? 1) * (cond && rule.pts(x, text) > 0 ? cond[1] : 1)
      out.push({ what: `${rule.what}${cond ? ' ' + cond[2] : ''}${gate?.note ?? ''}`, pts: +(rule.pts(x, text) * share).toFixed(2) })
    }
  }
  return out
}

// ---- Synergy: what a card offers other cards, and what it needs from them.
const GIVES: [string, (c: Card) => boolean][] = [
  ['a 1-cost Waza', (c) => c.type === 'Waza' && c.cost === 1],
  ['a Waza', (c) => c.type === 'Waza'],
  ['a Waza of cost 2+', (c) => c.type === 'Waza' && c.cost >= 2],
  ['a cheap Horobeat', (c) => c.type === 'Horobeat' && c.cost <= 2],
  ['a 7+ cost Horobeat', (c) => c.type === 'Horobeat' && c.cost >= 7],
  ['a good Overbeat base', (c) => /Overbeat onto this Horobeat.*draw|its cost is 1 higher/.test(c.effect)],
  ['Boost', (c) => c.boost >= 2000],
  ['recovery', (c) => /choose 1 of your Horobeats and recover/.test(c.effect)],
  ['extra Ena', (c) => /return it to unused|into their Ena|in your Ena unused|turn all your Ena unused/.test(c.effect)],
  ['card draw', (c) => /draw \d/.test(c.effect)],
]
const WANTS: [string, RegExp][] = [
  ['a 1-cost Waza', /cost-1 Waza|Waza with a cost of 1/],
  ['a Waza', /is using a Waza|second Waza|Blue Waza with a cost of 3 or less|reveal 1 Waza/],
  ['a Waza of cost 2+', /Waza with cost 2 or more/],
  ['a cheap Horobeat', /4 or more (of your |red )?Horobeats|Horobeat with a cost of 2 or less/],
  ['a 7+ cost Horobeat', /cost of 7 or more/],
  ['a good Overbeat base', /cards under|cards underneath|beneath/],
  ['Boost', /Boost has been used|use Boost on this/],
  ['recovery', /is not downed/],
  ['extra Ena', /8 or more cards in your Ena/],
  ['card draw', /6 or more cards in your hand/],
]
const tribeKey = (c: Card) => c.tribe.split(' ')[0]
function synergy(c: Card) {
  const mates = cards.filter((o) => o.color === c.color && o !== c)
  const notes: string[] = []
  let pts = 0
  const partners = new Set<string>()
  // What it needs: is there enough of it in the color? Eight suppliers or more counts as always there.
  for (const [tag, re] of WANTS) {
    if (!re.test(c.effect)) continue
    const givers = mates.filter((o) => GIVES.find(([t]) => t === tag)![1](o))
    givers.forEach((o) => partners.add(o.name))
    const share = Math.min(1, givers.length / 8)
    pts += share
    notes.push(`needs ${tag}: ${givers.length} in ${c.color}`)
  }
  const res = /Resonance: (\w+)/.exec(c.effect)
  if (res) {
    const tribe = mates.filter((o) => o.type === 'Horobeat' && tribeKey(o) === res[1])
    tribe.forEach((o) => partners.add(o.name))
    pts += Math.min(1, tribe.length / 8)
    notes.push(`needs ${res[1]} Horobeat: ${tribe.length} in ${c.color}`)
  }
  // What it offers: a quarter point for every card of the color that needs it, up to 1 point per kind.
  for (const [tag, gives] of GIVES) {
    if (!gives(c)) continue
    const takers = mates.filter((o) => WANTS.find(([t]) => t === tag)![1].test(o.effect))
    if (!takers.length) continue
    takers.forEach((o) => partners.add(o.name))
    pts += Math.min(1, 0.25 * takers.length)
    notes.push(`${tag} for ${takers.length}: ${takers.map((o) => o.name).slice(0, 4).join(', ')}${takers.length > 4 ? '…' : ''}`)
  }
  if (c.type === 'Horobeat') {
    const waza = mates.filter((o) => new RegExp(`Resonance: ${tribeKey(c)}\\b`).test(o.effect))
    if (waza.length) { waza.forEach((o) => partners.add(o.name)); pts += 0.5 * waza.length; notes.push(`${tribeKey(c)} Waza: ${waza.map((o) => o.name).join(', ')}`) }
  }
  return { pts: +Math.min(2.5, pts).toFixed(2), partners: partners.size, notes }
}

const rows = cards.map((c) => {
  const b = BENCH[c.type]?.[String(c.cost)]
  if (!b) throw new Error(`No benchmark for ${c.type} ${c.cost}`)
  // Power against the level's no-Boost benchmark. Boost is scored on its own: a flat +1 (Jeff, 2026-11-25).
  const stats = +((c.power - b.plain) / 1000).toFixed(2)
  const boost = c.boost > 0 ? 1 : 0
  const parts = effectParts(c)
  const effect = +parts.reduce((a, p) => a + p.pts, 0).toFixed(2)
  const syn = synergy(c)
  return { c, stats, boost, effect, parts, syn, total: +(stats + boost + effect).toFixed(2) }
})
const missed = rows.flatMap((r) => r.parts.filter((p) => p.what.startsWith('NOT RATED')).map((p) => `${r.c.name}: ${p.what}`))
if (missed.length) { console.error(`${missed.length} effect sentence(s) have no rule yet:`); missed.forEach((m) => console.error('  ' + m)) }

rows.sort((a, b) => a.c.color.localeCompare(b.c.color) || (a.c.type === b.c.type ? 0 : a.c.type === 'Horobeat' ? -1 : 1) || a.c.cost - b.c.cost || b.total - a.total)
const sign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`
let head = ''
for (const r of rows) {
  const h = `${r.c.color} ${r.c.type} level ${r.c.cost}`
  if (h !== head) { head = h; console.log(`\n${h}  (benchmark ${BENCH[r.c.type][String(r.c.cost)].plain}${BENCH[r.c.type][String(r.c.cost)].boosted ? ', with Boost ' + BENCH[r.c.type][String(r.c.cost)].boosted : ''})`) }
  console.log(`  ${sign(r.total).padStart(5)}  ${r.c.name.slice(0, 40).padEnd(40)} stats ${sign(r.stats).padStart(5)}  boost ${sign(r.boost).padStart(5)}  effect ${sign(r.effect).padStart(5)}  synergy ${sign(r.syn.pts).padStart(5)} (${r.syn.partners} cards)`)
}
const outJson = path.join(HERE, 'results', 'ratings-horobeat.json')
fs.writeFileSync(outJson, JSON.stringify(rows.map((r) => ({ id: r.c.id, name: r.c.name, color: r.c.color, type: r.c.type, level: r.c.cost, power: r.c.power, boost: r.c.boost, tribe: r.c.tribe, rating: r.total, stats: r.stats, boostPts: r.boost, effect: r.effect, synergy: r.syn.pts, partners: r.syn.partners, effectNotes: r.parts.map((p) => `${p.what} ${sign(p.pts)}`), synergyNotes: r.syn.notes })), null, 1))
const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
fs.writeFileSync(outJson.replace('.json', '.csv'), ['Color,Type,Level,Card,Rating,Stats,Boost,Effect,Synergy,Works with (cards),Effect notes,Synergy notes', ...rows.map((r) => [r.c.color, r.c.type, r.c.cost, q(r.c.name), r.total, r.stats, r.boost, r.effect, r.syn.pts, r.syn.partners, q(r.parts.map((p) => `${p.what} ${sign(p.pts)}`).join('; ')), q(r.syn.notes.join('; '))].join(','))].join('\n'))
console.log(`\n${rows.length} cards rated. Saved to ${outJson} and .csv`)
