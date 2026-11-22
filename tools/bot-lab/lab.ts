// Shared pieces for the bot lab: the games it knows, the standing test decks, and playing one match
// between two computer players. To add a game, add it to GAMES (see README.md, "Adding a game").
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Match } from '../../src/sim/engine'
import { cpuChoice as horobeatChoice, MISTAKES as horobeatMistakes } from '../../src/sim/ai'
import { HQ } from '../../src/sim/hq/engine'
import { cpuChoice as haikyuChoice, MISTAKES as haikyuMistakes } from '../../src/sim/hq/ai'
import { EFFORT, rng, type Effort, type Level } from '../../src/sim/search'

export { rng }
export const HERE = path.dirname(fileURLToPath(import.meta.url))
export type Setup = { seed: number; decks: [string[], string[]]; names: [string, string] }
/** Anything with the engine's shape: a question waiting (`req`), `answer()`, and a state with a winner. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMatch = any
export type GameDef = {
  label: string
  create: (setup: Setup) => AnyMatch
  choose: (m: AnyMatch, level: Level, rnd: () => number, effort?: Effort) => number
  /** Rebuild a match from its starting point and the answers given so far. */
  replay: (setup: Setup, answers: number[]) => AnyMatch
  /** What this game's computer player has been taught not to do. */
  mistakes: Mistake[]
  /** Which seat has the first turn (or first serve), read once the match has started. */
  first: (m: AnyMatch) => 0 | 1 | null
}
export type Mistake = { id: string; taught: string; what: string; forbid?: boolean; is: (m: AnyMatch, opt: AnyMatch) => boolean }
export const GAMES: Record<string, GameDef> = {
  horobeat: { label: 'HORO-BEAT', create: (s) => new Match(s as never), choose: (m, l, r, e) => horobeatChoice(m, l, r, e), replay: (s, a) => Match.replay(s as never, a), mistakes: horobeatMistakes.map((k) => ({ ...k, forbid: true })), first: (m) => m.s.first ?? null },
  haikyu: { label: 'Haikyu!! VOBACA!! BREAK', create: (s) => new HQ(s as never), choose: (m, l, r, e) => haikyuChoice(m, l, r, e), replay: (s, a) => HQ.replay(s as never, a), mistakes: haikyuMistakes, first: (m) => m.s.serveRight ?? null },
}
export function game(name: string): GameDef {
  const g = GAMES[name] || GAMES[{ hb: 'horobeat', hq: 'haikyu' }[name] || '']
  if (!g) throw new Error(`Unknown game "${name}". Known: ${Object.keys(GAMES).join(', ')}`)
  return g
}
export const gameKey = (name: string) => ({ hb: 'horobeat', hq: 'haikyu' }[name] || name)

export type Deck = { name: string; file: string; ids: string[] }
export function loadDeck(file: string): Deck {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  const ids = Object.entries(d.deck as Record<string, number>).flatMap(([id, n]) => Array(n).fill(id) as string[])
  return { name: d.name || path.basename(file, '.json'), file, ids }
}
/** The standing test decks for a game, or the files given. */
export function decksFor(gameName: string, files: string[] = []): Deck[] {
  if (files.length) return files.map(loadDeck)
  const dir = path.join(HERE, 'decks', gameKey(gameName))
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => loadDeck(path.join(dir, f)))
}

/** A computer player: "hard", "expert:sims=600", "hard:plain", "normal". Thinking is never cut off by the clock here, so runs repeat exactly. */
export type Seat = { level: Level; effort?: Effort; label: string }
export function seat(spec: string): Seat {
  const [level, ...mods] = spec.split(':') as [Level, ...string[]]
  const base = EFFORT[level]
  if (!base) return { level, label: spec }
  const effort: Effort = { ...base, ms: 1e9 }
  for (const m of mods) {
    if (m === 'plain') effort.plain = true
    else if (m.startsWith('sims=')) effort.sims = +m.slice(5)
    else throw new Error(`Unknown setting "${m}" in "${spec}"`)
  }
  return { level, effort, label: spec }
}

export type Watch = (m: AnyMatch, choice: number, who: 0 | 1) => void
/** Plays one match. Returns the winning seat, or null if it did not finish. */
export function playMatch(g: GameDef, setup: Setup, seats: [Seat, Seat], watch?: Watch): { winner: 0 | 1 | null; first: 0 | 1 | null; m: AnyMatch } {
  const m = g.create(setup)
  let first: 0 | 1 | null = null
  const r = rng(setup.seed)
  let steps = 0
  try {
    while (m.req && steps++ < 5000) {
      const who = m.req.p as 0 | 1
      if (first == null && steps > 4) first = g.first(m)
      const c = g.choose(m, seats[who].level, r, seats[who].effort)
      if (watch) watch(m, c, who)
      m.answer(c)
    }
  } catch (e) {
    console.error('match stopped:', e instanceof Error ? e.message : e)
    return { winner: null, first, m }
  }
  return { winner: m.s.winner ?? null, first, m }
}
export const pct = (w: number, n: number) => (n ? `${((100 * w) / n).toFixed(1)}%` : 'n/a')
/** The margin of error (one standard error) on a win rate over n games, in points. */
export const margin = (n: number) => (n ? (50 / Math.sqrt(n)).toFixed(1) : '?')
