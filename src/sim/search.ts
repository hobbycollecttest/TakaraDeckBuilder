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
  /**
   * Choices that are usually wrong but not always. They are thought about like any other, and chosen
   * only when the sample games show them clearly ahead of the best ordinary choice. A near tie goes
   * to the ordinary choice.
   */
  doubt?: (choice: number) => boolean
}
/** `sims` is how many sample games one choice may use in all, `ms` the longest it may take. `plain` keeps the first, simpler way of sharing them out, `flat` guesses the other player's hand with no lean, and `stepwise` judges one card at a time instead of whole turns (all three are for comparisons). */
export type Effort = { sims: number; ms: number; maxSteps: number; plain?: boolean; flat?: boolean; stepwise?: boolean }

export type Level = 'beginner' | 'easy' | 'normal' | 'hard' | 'expert'
export const LEVELS: { id: Level; label: string }[] = [
  { id: 'beginner', label: 'Beginner' }, { id: 'easy', label: 'Easy' }, { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' }, { id: 'expert', label: 'Expert' },
]
/** How long Hard and Expert may think about one choice. */
export const EFFORT: Partial<Record<Level, Effort>> = {
  hard: { sims: 150, ms: 300, maxSteps: 600 },
  expert: { sims: 600, ms: 900, maxSteps: 600 },
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

type Slot = { get: () => number; set: (u: number) => void }
/**
 * Deal the hidden cards of the other player with a lean: cards that players in this spot tend to be
 * holding are more likely to land in the hand. `lean` is 1 for no opinion, above 1 for likelier in hand.
 * The rest are shuffled evenly into the other hidden places.
 */
export function dealLeaning(hand: Slot[], rest: Slot[], lean: (uid: number) => number, rnd: () => number) {
  const cards = [...hand, ...rest].map((s) => s.get())
  // Each card draws a ticket; a bigger lean makes a high ticket likelier. The highest tickets are the hand.
  const ticket = cards.map((u) => ({ u, t: Math.pow(rnd(), 1 / Math.max(0.05, lean(u))) })).sort((a, b) => b.t - a.t)
  hand.forEach((s, i) => s.set(ticket[i].u))
  const others = ticket.slice(hand.length).map((x) => x.u)
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[others[i], others[j]] = [others[j], others[i]]
  }
  rest.forEach((s, i) => s.set(others[i]))
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
  let alive = Array.from({ length: count }, (_, i) => i)
  if (game.skip) {
    const kept = alive.filter((c) => !game.skip!(c))
    if (kept.length === 1) return kept[0]
    if (kept.length) alive = kept
  }
  let spent = 0
  let k = 0
  if (effort.plain) {
    // Keep halving the field and spending more on the choices that look best.
    let per = Math.max(2, Math.floor(effort.sims / (count * 3)))
    while (alive.length > 1 && spent < effort.sims && now() < deadline) {
      for (let r = 0; r < per && now() < deadline; r++, k++) for (const c of alive) { playOut(c, k); spent++ }
      const score = (c: number) => (runs[c] ? total[c] / runs[c] : 0) + (c === favourite ? 0.02 : 0)
      alive = [...alive].sort((a, b) => score(b) - score(a)).slice(0, Math.max(1, Math.ceil(alive.length / 2)))
      per *= 2
    }
  } else {
    // Every round, each choice still in the running plays the same imagined game. A choice is dropped
    // as soon as it is clearly behind the leader on the games they both played; if nothing is clearly
    // behind, the weakest are dropped at set points so the samples go to the close calls. Thinking
    // stops early once one choice is clearly ahead of all the others.
    const seen: number[][] = Array.from({ length: count }, () => [])
    const mean = (c: number) => (runs[c] ? total[c] / runs[c] : 0) + (c === favourite ? 0.02 : 0)
    const behind = (lead: number, c: number, strict = false) => {
      const n = Math.min(seen[lead].length, seen[c].length)
      if (n < (strict ? 12 : 6)) return false
      let sum = 0
      let sq = 0
      for (let t = 0; t < n; t++) { const d = seen[lead][t] - seen[c][t]; sum += d; sq += d * d }
      const avg = sum / n
      const se = Math.sqrt(Math.max(1e-9, sq / n - avg * avg) / n)
      return avg - (strict ? 2.6 : 2.2) * se > 0
    }
    const doubted = (c: number) => !!game.doubt && game.doubt(c)
    const cuts = [0.3, 0.55, 0.75]
    let cut = 0
    while (alive.length > 1 && spent < effort.sims && now() < deadline) {
      for (const c of alive) {
        const before = total[c]
        const ran = runs[c]
        playOut(c, k)
        seen[c].push(runs[c] > ran ? total[c] - before : 0.5)
        spent++
      }
      k++
      const lead = alive.reduce((a, b) => (mean(b) > mean(a) ? b : a))
      alive = alive.filter((c) => c === lead || !behind(lead, c))
      if (cut < cuts.length && spent >= effort.sims * cuts[cut]) {
        cut++
        const ranked = [...alive].sort((a, b) => mean(b) - mean(a))
        const keep = ranked.slice(0, Math.max(2, Math.ceil(alive.length / 2)))
        // While a doubtful choice is in the running, the best ordinary choice stays to be compared with it.
        const ordinary = ranked.find((c) => !doubted(c))
        if (ordinary != null && !keep.includes(ordinary) && keep.some(doubted)) keep.push(ordinary)
        alive = keep
      }
    }
    if (runs.some((n) => n > 0) && game.doubt) {
      const tried = Array.from({ length: count }, (_, c) => c).filter((c) => runs[c] > 0)
      const top = (alive.length ? alive : tried).reduce((a, b) => (mean(b) > mean(a) ? b : a))
      const ordinary = tried.filter((c) => !doubted(c)).sort((a, b) => mean(b) - mean(a))[0]
      if (doubted(top) && ordinary != null) {
        // An unusual choice on top deserves a closer look before it is trusted or thrown out: play the
        // two off against each other for a while longer. It has to win by a wide, well-sampled margin,
        // because being on top is partly luck; anything less goes to the ordinary choice.
        const one = (c: number) => { const before = total[c]; const ran = runs[c]; playOut(c, k); seen[c].push(runs[c] > ran ? total[c] - before : 0.5) }
        // Only games both have played can be compared, so line the two records up first.
        const shared = Math.min(seen[top].length, seen[ordinary].length)
        seen[top].length = shared
        seen[ordinary].length = shared
        for (let extra = 0; extra < effort.sims && now() < deadline && !behind(top, ordinary, true) && !behind(ordinary, top); extra += 2, k++) { one(top); one(ordinary) }
        return behind(top, ordinary, true) ? top : ordinary
      }
    }
  }
  if (!runs.some((n) => n > 0)) return favourite
  const score = (c: number) => (runs[c] ? total[c] / runs[c] : -1) + (c === favourite ? 0.02 : 0)
  return alive.reduce((a, b) => (score(b) > score(a) ? b : a))
}
