// Ready-made practice decks for Haikyu, one per school, built from the card list by a fixed
// recipe: receivers, setters and attackers in the numbers a 40-card deck needs, plus 8 Events.
import { DEFS, type Def } from './engine.js'

export type DeckList = { name: string; team: string; ids: string[] }

const plain = (a: Def, b: Def) => a.id.length - b.id.length || a.id.localeCompare(b.id)

function build(team: string): string[] {
  // One printing per card number.
  const byNo = new Map<string, Def>()
  for (const d of DEFS.values()) {
    if (!d.schools.includes(team)) continue
    const had = byNo.get(d.no)
    if (!had || plain(d, had) < 0) byNo.set(d.no, d)
  }
  const pool = [...byNo.values()]
  const chars = pool.filter((d) => d.type === 'Character' && d.rc != null)
  const ids: string[] = []
  const used = new Map<string, number>()
  const take = (list: Def[], score: (d: Def) => number, count: number, copies = 3) => {
    for (const d of [...list].sort((a, b) => score(b) - score(a))) {
      while ((used.get(d.id) || 0) < copies && count > 0) { ids.push(d.id); used.set(d.id, (used.get(d.id) || 0) + 1); count-- }
      if (count <= 0) break
    }
  }
  const text = (d: Def) => (d.text ? 0.6 : 0)
  take(chars.filter((d) => (d.st ?? 0) >= 1), (d) => (d.st ?? 0) * 3 + (d.sv ?? 0) * 0.3 + text(d), 8)
  take(chars.filter((d) => (d.rc ?? 0) >= 4 && !used.has(d.id)), (d) => (d.rc ?? 0) + text(d), 10)
  take(chars.filter((d) => (d.at ?? 0) >= 3 && !used.has(d.id)), (d) => (d.at ?? 0) + (d.sv ?? 0) * 0.3 + text(d), 10)
  take(chars.filter((d) => !used.has(d.id)), (d) => Math.max(d.bl ?? 0, d.sv ?? 0) + text(d), 32 - ids.length, 2)
  take(chars, (d) => (d.rc ?? 0) + (d.at ?? 0), 32 - ids.length, 4)
  take(pool.filter((d) => d.type === 'Event'), (d) => (/Draw 1 card/.test(d.text) ? 2 : 0) + (d.text.length < 160 ? 1 : 0), 8, 2)
  take(chars, (d) => (d.rc ?? 0) + (d.at ?? 0), 40 - ids.length, 5)
  return ids.slice(0, 40)
}

const TEAMS = ['Karasuno', 'Nekoma', 'Aoba Johsai', 'Inarizaki', 'Shiratorizawa', 'Fukurodani', 'Date Tech']
export const HQ_PRACTICE: DeckList[] = TEAMS.map((team) => ({ name: `${team} practice deck`, team, ids: build(team) }))

// The two official Starter Decks, used by the tutorial. Takara Tomy lists the 12 cards in
// each box but not how many copies of each, so these counts are our own split of the 40.
const starter = (set: string, counts: number[]) => counts.flatMap((n, i) => {
  const id = `${set}-${String(i + 1).padStart(3, '0')}-d`
  if (!DEFS.has(id)) throw new Error(`Missing starter card ${id}`)
  return Array(n).fill(id) as string[]
})
export const HQ_STARTERS: DeckList[] = [
  { name: 'Karasuno Starter Deck', team: 'Karasuno', ids: starter('hv-d01', [4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4]) },
  { name: 'Nekoma Starter Deck', team: 'Nekoma', ids: starter('hv-d02', [4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4]) },
]

/** Turn a saved deck (card id and copies) into a list of 40 card ids, or say why not. */
export function expandHQ(deck: Record<string, number>): { ids: string[]; error: string } {
  const ids: string[] = []
  let events = 0
  for (const [id, n] of Object.entries(deck)) {
    const d = DEFS.get(id)
    if (!d || !(n > 0)) continue
    if (d.type === 'Event') events += n
    for (let i = 0; i < n; i++) ids.push(id)
  }
  if (ids.length !== 40) return { ids, error: `This deck has ${ids.length} cards. A deck needs exactly 40.` }
  if (events > 8) return { ids, error: 'This deck has more than 8 Event cards.' }
  return { ids, error: '' }
}
