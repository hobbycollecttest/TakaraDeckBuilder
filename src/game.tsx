import type { ReactNode } from 'react'

// What every game's cards share. Each game adds its own fields on top.
export type Card = { id: string; no: string; name: string; jp: string; set: string; rarity: string; type: string; artist: string; v?: number }
export type View = 'en' | 'jp'
export type Deck = Record<string, number>
export type Entry = { card: Card; n: number }

export type Filter = {
  key: string
  title: string
  kind: 'chips' | 'checks' | 'nums' | 'select'
  options: string[]
  label?: (option: string) => string
  cols?: number // buttons per row for 'nums'
  values: (c: Card) => string[] // a card passes when one of its values is picked
}

export type Game = {
  key: string
  title: string // short name in the header
  fullName: string
  path: string
  links: { label: string; href: string }[]
  cards: Card[]
  deckSize: number
  maxCopies: number
  copyKey: (c: Card) => string
  typeLimits: Record<string, number> // most cards of a type allowed in one deck
  rulesLine: string
  types: string[]
  filters: Filter[]
  sorts: { key: string; label: string; cmp: (a: Card, b: Card) => number }[]
  deckSort: (a: Card, b: Card) => number
  tags: string[] // colors or schools: shown as dots and used to filter public decks
  tagHex: Record<string, string>
  tagsOf: (c: Card) => string[]
  tagMin: number // cards of a tag a deck needs before the tag is shown on it
  pip: (c: Card) => { text: string; color: string }
  curve: { title: string; labels: string[]; bucket: (c: Card) => number | null }
  extraStats: (entries: Entry[]) => [string, number | string][]
  search: (c: Card) => string
  img: (c: Card, view: View, large?: boolean) => string
  facts: (c: Card) => [string, string | number | null][]
  body: (c: Card) => ReactNode
  footer: string
}

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode: the deck still works for this visit */
    }
  },
}

export const GAMES = [
  { key: 'horobeat', title: 'HORO-BEAT', path: '/', logo: '/logos/horobeat.svg' },
  { key: 'haikyu', title: 'Haikyu!! VOBACA!! BREAK', path: '/haikyu', logo: '/logos/haikyu.svg' },
]
