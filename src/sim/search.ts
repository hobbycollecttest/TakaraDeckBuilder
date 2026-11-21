// Thinking ahead, for the Hard and Expert computer players in both games.
//
// The computer does not get to see hidden cards. Instead it imagines them: it takes
// every card it cannot see (the other player's hand, both decks, face-down cards),
// shuffles them into a guess, and plays the rest of the match out quickly from there
// with the Normal player's habits on both sides. It does this many times for each
// choice it could make, with a different guess each time, and picks the choice that
// wins most often.
export type SearchGame<M> = {
  /** A fresh copy of the match at the point where the choice has to be made. */
  copy: () => M
  /** Reshuffle everything the deciding player cannot see, and the copy's future luck. */
  hide: (m: M, rnd: () => number) => void
  open: (m: M) => boolean
  options: (m: M) => number
  answer: (m: M, i: number) => void
  /** The quick habit used to play out the rest of the match. */
  habit: (m: M, rnd: () => number) => number
  /** How the finished (or cut off) match went for the deciding player, from 0 to 1. */
  result: (m: M) => number
  /** Choices that are known mistakes and not worth thinking about. Never all of them. */
  skip?: (choice: number) => boolean
}
export type Effort = { sims: number; ms: number; maxSteps: number }

export type Level = 'beginner' | 'easy' | 'normal' | 'hard' | 'expert'
export const LEVELS: { id: Level; label: string }[] = [
  { id: 'beginner', label: 'Beginner' }, { id: 'easy', label: 'Easy' }, { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' }, { id: 'expert', label: 'Expert' },
]
/** How long Hard and Expert may think about one choice. */
export const EFFORT: Partial<Record<Level, Effort>> = {
  hard: { sims: 48, ms: 300, maxSteps: 600 },
  expert: { sims: 320, ms: 700, maxSteps: 600 },
}

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Shuffle the cards in the given places among themselves. Each place is a getter and setter for one card. */
export function shuffleSlots(slots: { get: () => number; set: (u: number) => void }[], rnd: () => number) {
  const cards = slots.map((s) => s.get())
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  slots.forEach((s, i) => s.set(cards[i]))
}

export function searchChoice<M>(game: SearchGame<M>, count: number, favourite: number, effort: Effort, rnd: () => number): number {
  if (count <= 1) return 0
  const deadline = now() + effort.ms
  const base = Math.floor(rnd() * 2 ** 31)
  const total = new Array<number>(count).fill(0)
  const runs = new Array<number>(count).fill(0)
  const playOut = (choice: number, k: number) => {
    try {
      const m = game.copy()
      // The same guess number gives every choice the same imagined cards, so they are compared fairly.
      game.hide(m, rng(base + k * 7919))
      const luck = rng(base + k * 104729 + 1)
      game.answer(m, choice)
      for (let steps = 0; game.open(m) && steps < effort.maxSteps; steps++) game.answer(m, game.habit(m, luck))
      total[choice] += game.result(m)
      runs[choice]++
    } catch {
      // A guess that could not be played out (a card the engine expected elsewhere) is skipped.
    }
  }
  // Start with every choice, then keep halving the field and spending more on the ones that look best.
  let alive = Array.from({ length: count }, (_, i) => i)
  if (game.skip) {
    const kept = alive.filter((c) => !game.skip!(c))
    if (kept.length === 1) return kept[0]
    if (kept.length) alive = kept
  }
  let spent = 0
  let k = 0
  let per = Math.max(2, Math.floor(effort.sims / (count * 3)))
  while (alive.length > 1 && spent < effort.sims && now() < deadline) {
    for (let r = 0; r < per && now() < deadline; r++, k++) for (const c of alive) { playOut(c, k); spent++ }
    const score = (c: number) => (runs[c] ? total[c] / runs[c] : 0) + (c === favourite ? 0.02 : 0)
    alive = [...alive].sort((a, b) => score(b) - score(a)).slice(0, Math.max(1, Math.ceil(alive.length / 2)))
    per *= 2
  }
  if (!runs.some((n) => n > 0)) return favourite
  const score = (c: number) => (runs[c] ? total[c] / runs[c] : -1) + (c === favourite ? 0.02 : 0)
  return alive.reduce((a, b) => (score(b) > score(a) ? b : a))
}
