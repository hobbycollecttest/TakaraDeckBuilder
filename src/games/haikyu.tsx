import raw from '../haikyu.json'
import type { Card, Game } from '../game'

type HV = Card & {
  r: string; aff: string; schools: string[]; years: string[]; pos: string[]
  sv: number | null; bl: number | null; rc: number | null; st: number | null; at: number | null
  text: string; note: string; en: number
}
const CARDS = (raw as Omit<HV, 'rarity'>[]).map((c) => ({ ...c, rarity: c.r })) as HV[]
const h = (c: Card) => c as HV
const POS = ['WS', 'S', 'MB', 'Li']
const RARITIES = ['N', 'NP', 'NA', 'R', 'RP', 'RA', 'S', 'SP', 'SA', 'Summit', 'Summit P', 'Summit A', 'Secret', 'Ultimate', 'Ultimate P', 'D', 'DP', 'P', 'PR']
const SCHOOL_HEX: Record<string, string> = {
  Karasuno: '#e8730c', 'Aoba Johsai': '#2fa89b', Nekoma: '#c62828', Inarizaki: '#7a1f3d', Shiratorizawa: '#6b3fa0', 'Date Tech': '#1f7a4d',
  Fukurodani: '#a8842a', Youth: '#1f3a8a', 'Pseudo-Youth': '#5b6c8f', Kakugawa: '#7d8526', Johzenji: '#d09a00', 'Wakutani Minami': '#2c8c8c',
  Itachiyama: '#9aa300', Kamomedai: '#3d7edb',
}
const OTHER = '#6d6e75'
const count = new Map<string, number>()
for (const c of CARDS) for (const s of c.schools) count.set(s, (count.get(s) || 0) + 1)
const SCHOOLS = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b))
const position = (c: Card) => (c.type === 'Event' ? [] : h(c).pos.map((p) => (POS.includes(p) ? p : 'Other')))
const bucket = (c: Card) => (c.type === 'Event' ? 5 : POS.includes(h(c).pos[0]) ? POS.indexOf(h(c).pos[0]) : 4)
const byName = (a: Card, b: Card) => a.name.localeCompare(b.name)
const byNo = (a: Card, b: Card) => a.no.localeCompare(b.no) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity)
const stat = (key: 'sv' | 'bl' | 'rc' | 'st' | 'at') => (a: Card, b: Card) => (h(b)[key] ?? -1) - (h(a)[key] ?? -1) || byNo(a, b)
// en: 1 = official English picture, 2 = our translated picture, 0 = Japanese picture only (special printings).
const folder = (c: Card, view: 'en' | 'jp') => (view === 'en' && h(c).en ? 'en' : 'jp')

const game: Game = {
  key: 'haikyu',
  title: 'HAIKYU!!',
  fullName: 'Haikyu!! VOBACA!! BREAK',
  path: '/haikyu',
  links: [{ label: 'Rules', href: '/haikyu/rules' }, { label: 'FAQ', href: '/haikyu/faq' }],
  cards: CARDS,
  deckSize: 40,
  maxCopies: 40,
  copyKey: (c) => c.id,
  typeLimits: { Event: 8 },
  rulesLine: 'A deck is exactly 40 cards, with at most 8 Event cards. You can use any number of copies of the same card.',
  types: ['Character', 'Event'],
  filters: [
    { key: 'school', title: 'School', kind: 'select', options: SCHOOLS, values: (c) => h(c).schools },
    { key: 'type', title: 'Type', kind: 'checks', options: ['Character', 'Event'], values: (c) => [c.type] },
    { key: 'pos', title: 'Position', kind: 'nums', cols: 5, options: [...POS, 'Other'], values: position },
    { key: 'year', title: 'Year', kind: 'nums', cols: 3, options: ['1st Year', '2nd Year', '3rd Year'], label: (y) => y.replace(' Year', ''), values: (c) => h(c).years },
    { key: 'rarity', title: 'Rarity', kind: 'select', options: RARITIES, values: (c) => [c.rarity] },
    { key: 'set', title: 'Set', kind: 'select', options: [...new Set(CARDS.map((c) => c.set))], values: (c) => [c.set] },
  ],
  sorts: [
    { key: 'number', label: 'Card number', cmp: byNo },
    { key: 'name', label: 'Name', cmp: (a, b) => byName(a, b) || byNo(a, b) },
    { key: 'sv', label: 'Serve', cmp: stat('sv') },
    { key: 'bl', label: 'Block', cmp: stat('bl') },
    { key: 'rc', label: 'Receive', cmp: stat('rc') },
    { key: 'st', label: 'Set', cmp: stat('st') },
    { key: 'at', label: 'Attack', cmp: stat('at') },
  ],
  deckSort: (a, b) => bucket(a) - bucket(b) || byName(a, b) || byNo(a, b),
  tags: SCHOOLS.filter((s) => SCHOOL_HEX[s]),
  tagHex: SCHOOL_HEX,
  tagsOf: (c) => h(c).schools.filter((s) => SCHOOL_HEX[s]),
  tagMin: 5,
  pip: (c) => ({ text: c.type === 'Event' ? 'EV' : POS.includes(h(c).pos[0]) ? h(c).pos[0] : '', color: SCHOOL_HEX[h(c).schools[0]] || OTHER }),
  curve: { title: 'Positions', labels: [...POS, 'Other', 'Event'], bucket },
  extraStats: (entries) => [['Event cards', `${entries.reduce((a, e) => a + (e.card.type === 'Event' ? e.n : 0), 0)}/8`]],
  search: (c) => `${c.name} ${c.jp} ${c.no} ${h(c).text} ${h(c).aff} ${h(c).pos.join(' ')}`,
  img: (c, view, large = false) => `/cards/haikyu/${folder(c, view)}${large ? '-lg' : ''}/${c.id}.webp${c.v ? `?v=${c.v}` : ''}`,
  facts: (c0) => {
    const c = h(c0)
    return [
      ['Type', c.type], ['Team', c.aff], [c.type === 'Event' ? 'Role' : 'Position', c.pos.join(', ')],
      ['Serve', c.sv], ['Block', c.bl], ['Receive', c.rc], ['Set', c.st], ['Attack', c.at],
      ['Product', c.set], ['Number', `${c.no} ${c.rarity}`], ['Illustrator', c.artist],
    ]
  },
  body: (c0) => {
    const c = h(c0)
    return (
      <>
        {c.text ? <p className="text">{c.text}</p> : null}
        {c.note ? <p className="text note">{c.note}</p> : null}
      </>
    )
  },
  footer: 'Card images and text © H. Furudate / Shueisha, "Haikyu!!" Project, MBS © TOMY.',
}
export default game
