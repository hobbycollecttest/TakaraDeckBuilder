import raw from '../horobeat.json'
import type { Card, Game } from '../game'

type HB = Card & {
  color: string; cost: number | null; power: number | null; boost: number | null; trigger: string; keyword: string; tribe: string
  effect: string; triggerText: string; flavor: string
}
const CARDS = raw as HB[]
const h = (c: Card) => c as HB
const RARITIES = ['C', 'UC', 'R', 'SR', 'DR', 'SEC']
const TRIGGERS = ['Entry Trigger', 'Over Trigger', 'Draw Trigger', 'Last Over Trigger']
const KEYWORDS = ['Barrier', 'Double Damage', 'Resonance', 'Ena Reading']
const COSTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
const uniq = (list: string[]) => [...new Set(list.filter(Boolean))].sort()
const byName = (a: Card, b: Card) => a.name.localeCompare(b.name)

const game: Game = {
  key: 'horobeat',
  title: 'HORO-BEAT',
  fullName: 'HORO-BEAT',
  path: '/',
  links: [{ label: 'How to play', href: '/how-to-play' }, { label: 'Rules', href: '/rules' }, { label: 'FAQ', href: '/faq' }],
  cards: CARDS,
  deckSize: 50,
  maxCopies: 4,
  // The rule counts copies by card name, so every printing of a name shares one limit.
  copyKey: (c) => c.jp || c.name,
  typeLimits: {},
  rulesLine: 'A deck is exactly 50 cards, with up to 4 copies of the same card name.',
  types: ['Horobeat', 'Waza'],
  filters: [
    { key: 'color', title: 'Color', kind: 'chips', options: ['Red', 'Green', 'Blue'], values: (c) => [h(c).color] },
    { key: 'type', title: 'Type', kind: 'checks', options: ['Horobeat', 'Waza'], values: (c) => [c.type] },
    { key: 'cost', title: 'Cost', kind: 'nums', cols: 5, options: COSTS, values: (c) => (h(c).cost == null ? [] : [String(Math.min(h(c).cost!, 10))]) },
    { key: 'trigger', title: 'Trigger', kind: 'checks', options: TRIGGERS, label: (t) => t.replace(' Trigger', ''), values: (c) => [h(c).trigger] },
    { key: 'keyword', title: 'Keyword', kind: 'checks', options: KEYWORDS, values: (c) => KEYWORDS.filter((k) => h(c).keyword.includes(k)) },
    { key: 'rarity', title: 'Rarity', kind: 'nums', options: RARITIES, values: (c) => [c.rarity] },
    { key: 'tribe', title: 'Tribe', kind: 'select', options: uniq(CARDS.map((c) => c.tribe)), values: (c) => [h(c).tribe] },
    { key: 'set', title: 'Set', kind: 'select', options: uniq(CARDS.map((c) => c.set)), values: (c) => [c.set] },
  ],
  sorts: [
    { key: 'number', label: 'Card number', cmp: (a, b) => a.no.localeCompare(b.no) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) },
    { key: 'cost', label: 'Cost', cmp: (a, b) => (h(a).cost ?? 99) - (h(b).cost ?? 99) || byName(a, b) },
    { key: 'power', label: 'Power', cmp: (a, b) => (h(b).power ?? -1) - (h(a).power ?? -1) || byName(a, b) },
    { key: 'name', label: 'Name', cmp: byName },
  ],
  deckSort: (a, b) => (h(a).cost ?? 99) - (h(b).cost ?? 99) || byName(a, b),
  tags: ['Red', 'Green', 'Blue'],
  tagHex: { Red: '#d2332a', Green: '#2f9144', Blue: '#1f79c9' },
  tagsOf: (c) => [h(c).color],
  tagMin: 1,
  pip: (c) => ({ text: String(h(c).cost ?? ''), color: game.tagHex[h(c).color] }),
  curve: { title: 'Cost curve', labels: COSTS, bucket: (c) => (h(c).cost == null ? null : Math.min(Math.max(h(c).cost!, 1), 10) - 1) },
  extraStats: (entries) =>
    TRIGGERS.map((t): [string, number] => [t, entries.reduce((a, e) => a + (h(e.card).trigger === t ? e.n : 0), 0)]).filter(([, n]) => n),
  search: (c) => `${c.name} ${c.jp} ${c.no} ${h(c).effect} ${h(c).tribe}`,
  img: (c, view, large = false) => `/cards/horobeat/${view}${large ? '-lg' : ''}/${c.id}.webp${c.v && view === 'en' ? `?v=${c.v}` : ''}`,
  facts: (c0) => {
    const c = h(c0)
    return [
      ['Type', c.type], ['Color', c.color], ['Cost', c.cost], ['Power', c.power], ['Boost', c.boost ? `+${c.boost}` : null],
      ['Trigger', c.trigger], ['Keyword', c.keyword], ['Tribe', c.tribe], ['Set', c.set], ['Number', `${c.no} ${c.rarity}`], ['Illustrator', c.artist],
    ]
  },
  body: (c0) => {
    const c = h(c0)
    return (
      <>
        {c.effect ? <p className="text">{c.effect}</p> : null}
        {c.triggerText ? <p className="text"><b>{c.trigger}:</b> {c.triggerText}</p> : null}
        {c.flavor ? <p className="flavor">{c.flavor}</p> : null}
      </>
    )
  },
  footer: 'Card images and text © Shogakukan / TOMY. English card text is a reference translation, not an official release.',
}
export default game
