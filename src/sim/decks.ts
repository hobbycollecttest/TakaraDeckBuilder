// Ready-made practice decks, so anyone can start a match without building a deck first.
// They are put together from the card list by a fixed recipe: 40 Horobeat on a sensible
// cost curve and 10 Waza, with 4 copies of the strongest card in each slot.
import { DEFS, type Color, type Def } from './engine'

export type DeckList = { name: string; color: Color; ids: string[] }

const RARITY = ['C', 'UC', 'R', 'SR', 'DR', 'SEC']
const rarityOf = (id: string) => RARITY.indexOf(id.split('-').pop()!.toUpperCase())

function build(color: Color): string[] {
  // One printing per card name: the plainest one.
  const byName = new Map<string, Def>()
  for (const d of DEFS.values()) {
    if (d.color !== color) continue
    const had = byName.get(d.name)
    if (!had || rarityOf(d.id) < rarityOf(had.id)) byName.set(d.name, d)
  }
  const pool = [...byName.values()]
  const strong = (a: Def, b: Def) => b.power + (b.effect ? 600 : 0) + (b.boost ? 300 : 0) - (a.power + (a.effect ? 600 : 0) + (a.boost ? 300 : 0)) || a.name.localeCompare(b.name)
  const ids: string[] = []
  const take = (cards: Def[], count: number) => {
    for (const d of cards.sort(strong)) {
      for (let i = 0; i < 4 && count > 0; i++, count--) ids.push(d.id)
      if (count <= 0) break
    }
  }
  const h = (lo: number, hi: number) => pool.filter((d) => d.type === 'Horobeat' && d.cost >= lo && d.cost <= hi)
  take(h(2, 2), 12)
  take(h(3, 3), 8)
  take(h(4, 4), 8)
  take(h(5, 5), 4)
  take(h(6, 6), 4)
  take(h(7, 10), 4)
  take(pool.filter((d) => d.type === 'Waza' && d.cost === 1), 4)
  take(pool.filter((d) => d.type === 'Waza' && d.cost >= 2), 50 - ids.length)
  return ids
}

export const PRACTICE: DeckList[] = (['Red', 'Green', 'Blue'] as Color[]).map((color) => ({ name: `${color} practice deck`, color, ids: build(color) }))

// The two official Start Decks, used by the tutorial. Takara Tomy lists the 17 cards in
// each box but not how many copies of each, so these counts are our own split of the 50.
const start = (set: string, counts: number[]) => counts.flatMap((n, i) => {
  const no = String(i + 1).padStart(3, '0')
  const id = [...DEFS.keys()].find((k) => k.startsWith(`${set}-${no}-`))!
  return Array(n).fill(id) as string[]
})
export const STARTERS: DeckList[] = [
  { name: 'Red Start Deck: Leojin', color: 'Red', ids: start('hd01', [4, 4, 4, 4, 4, 3, 3, 4, 3, 3, 2, 2, 2, 2, 2, 1, 3]) },
  { name: 'Green Start Deck: Shinazui', color: 'Green', ids: start('hd02', [4, 4, 4, 4, 3, 2, 4, 4, 3, 3, 2, 2, 3, 2, 2, 1, 3]) },
]

/** Turn a saved deck (card id and copies) into a list of 50 card ids, or say why not. */
export function expandDeck(deck: Record<string, number>): { ids: string[]; error: string } {
  const ids: string[] = []
  const names = new Map<string, number>()
  for (const [id, n] of Object.entries(deck)) {
    const d = DEFS.get(id)
    if (!d || !(n > 0)) continue
    names.set(d.name, (names.get(d.name) || 0) + n)
    for (let i = 0; i < n; i++) ids.push(id)
  }
  if (ids.length !== 50) return { ids, error: `This deck has ${ids.length} cards. A deck needs exactly 50.` }
  if ([...names.values()].some((n) => n > 4)) return { ids, error: 'This deck has more than 4 copies of a card.' }
  return { ids, error: '' }
}
