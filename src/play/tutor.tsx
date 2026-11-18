// The tutorial: a full match with the two Start Decks, where short lessons appear the
// first time each part of the game comes up, and the next good move is pointed out.
import type { Ev, Opt, Req, Side } from '../sim/engine'
import { STARTERS } from '../sim/decks'

export type Tutor = {
  seen: string[]
  onSeen: (key: string) => void
  /** The move we would make in the player's seat, as an option index. */
  suggest: () => number | null
  /** The computer's move. In the tutorial it is the same every time for the same game. */
  cpuPick: () => number
  color: 'Red' | 'Green'
}
export type Lesson = { key: string; title: string; body: string[]; pause: boolean }

// The tutorial is the same game every time: a fixed shuffle for each side, the opening
// hand is always kept, and the computer's choices repeat. These shuffles were picked so
// the player goes first, meets every lesson (Overbeat, Waza, Triggers) and wins by
// following the suggested moves.
/** A repeatable stand-in for Math.random, so the computer's easy-level choices in the
 *  tutorial depend only on how far the match has got. */
export function steadyRandom(seed: number, step: number) {
  let a = (seed * 2654435761 + step * 40503 + 1) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const TUTORIAL_SEED: Record<Tutor['color'], number> = { Red: 42, Green: 33 }
export const tutorialDecks = (color: Tutor['color']) => {
  const mine = STARTERS.find((s) => s.color === color)!
  const theirs = STARTERS.find((s) => s.color !== color)!
  return { mine, theirs }
}
const ACE: Record<Tutor['color'], string> = { Red: 'Rai Beat Leojin (cost 7)', Green: 'Raise Beat Shinazuisho (cost 9)' }

type Look = { ev: Ev | null; mine: Req | null; me: Side; seen: string[]; color: Tutor['color']; hint: Opt | null }

export function lessonFor({ ev, mine, me, seen, color, hint }: Look): Lesson | null {
  const fresh = (l: Lesson) => (seen.includes(l.key) ? null : l)
  const { theirs } = tutorialDecks(color)

  // Things that happen during play. The match waits while these are open.
  if (ev) {
    if (ev.t === 'line') return fresh({
      key: 'battle', pause: true, title: 'The Battle Phase',
      body: [
        'Lines fight one at a time, starting with Line 1. The Horobeat with more Power wins.',
        'The loser is downed (turned sideways) and its player takes 1 damage. A downed Horobeat that loses again is destroyed. A tie downs both.',
        'If nobody is across from your Horobeat, it wins that line for free.',
      ],
    })
    if (ev.t === 'damage') return fresh({
      key: 'hearts', pause: true, title: 'Hearts',
      body: [
        'Each player has 5 Hearts. Damage turns the top Heart sideways. When a sideways Heart is hit again, it is destroyed.',
        'A destroyed Heart goes to its owner’s hand, and it might fight back with a Trigger.',
        'With no Hearts left, the next damage loses the game. That last hit is the Finishing Blow.',
      ],
    })
    if (ev.t === 'phase' && ev.view.phase === 'end') return fresh({
      key: 'end', pause: true, title: 'End of the round',
      body: [
        'Every Ena you did not use draws you a card. This is Ena Draw, so saving Ena is never a waste.',
        'Then all Ena stand back up, and lines slide left to fill any gaps.',
        'Whoever won Line 1 goes first next round.',
      ],
    })
    if (ev.t === 'round' && ev.view.round === 2) return fresh({
      key: 'round2', pause: true, title: 'Round 2',
      body: [
        'From now on, each Summon Phase starts with drawing a card. Then you can charge one more Ena.',
        `More Ena means bigger Horobeat. Your deck’s ace is ${ACE[color]}. Overbeat it onto a cheap Horobeat to bring it out sooner.`,
      ],
    })
    return null
  }

  // Your decisions. These stay open beside the table while you choose.
  if (!mine || mine.p !== me) return null
  if (mine.kind === 'mulligan') return fresh({
    key: 'welcome', pause: false, title: 'Welcome to HORO\u2011BEAT',
    body: [
      `You have the ${color} Start Deck. The computer has the ${theirs.color} Start Deck.`,
      'Break all 5 of your opponent’s Hearts, then hit them once more to win.',
      'Here is your opening hand. In a normal match you could redraw all 6 cards once. This hand has cheap Horobeat to play right away, so keep it.',
    ],
  })
  if (mine.kind === 'charge') return fresh({
    key: 'ena', pause: false, title: 'Ena pays for your cards',
    body: [
      'Ena is your energy. You start with 1, and once per round you can put a card from your hand into your Ena Zone.',
      'A card’s cost is how many unused Ena it needs, and one of them must be the card’s color.',
      'Charge a card you won’t need for a while, like one that is too expensive to play soon. Click it in your hand, then click your Ena Zone.',
    ],
  })
  // Explained the first time Overbeat is the move we suggest, so the lesson and the tip agree.
  if (mine.kind === 'main' && hint?.via === 'over') return fresh({
    key: 'overbeat', pause: false, title: 'Overbeat',
    body: [
      'You can play a Horobeat on top of one you already have. It costs less: take away the cost of the one underneath.',
      'It comes in fresh, even if the one underneath was downed. That makes it a good way to save a line that is about to be destroyed.',
    ],
  })
  if (mine.kind === 'main') return fresh({
    key: 'summon', pause: false, title: 'Play your Horobeat',
    body: [
      'Horobeat are your fighters. Cards you can play have a gold outline. Click one, then click a line, or drag it onto the line.',
      'A new Horobeat always goes into your leftmost empty line. The number under it is its Power.',
      'Play as many as your Ena allows, then press End Summon Phase.',
    ],
  })
  if (mine.kind === 'battle') return fresh({
    key: 'waza', pause: false, title: 'Waza and Boost',
    body: [
      'Before a line’s battle is decided, both players can add Power, taking turns until both pass.',
      'A Waza card adds its Power and costs its cost. A Horobeat in your hand with a Boost value can be thrown in for just 1 Ena.',
      'If you are already ahead, passing keeps your cards for later.',
    ],
  })
  if (mine.kind === 'check') return fresh({
    key: 'check', pause: false, title: 'Triggers',
    body: [
      'A destroyed Heart can turn the game around. Draw Triggers draw 3 cards. Entry and Over Triggers put the Horobeat straight into play for free.',
      'A Last Over Trigger draws a card, and on your last Heart it can Overbeat for free.',
      'Or you can simply add the card to your hand.',
    ],
  })
  return null
}

/** A one-line description of a suggested move. */
export function tipFor(o: Opt, name: (uid: number) => string): string {
  const n = o.uid != null ? name(o.uid) : ''
  switch (o.t) {
    case 'keep': return 'Keep this hand.'
    case 'mulligan': return 'Redraw your hand.'
    case 'charge': return `Put ${n} into your Ena Zone.`
    case 'skip': return 'Skip Ena Charge this round.'
    case 'play': return o.via === 'over' ? `Overbeat with ${n} on Line ${o.line! + 1}.` : `Play ${n} to Line ${o.line! + 1}.`
    case 'end': return 'You are done here. End your Summon Phase.'
    case 'waza': return `Use ${n} as a Waza.`
    case 'boost': return `Boost with ${n}.`
    case 'pass': return 'Pass.'
    case 'take': return 'Add the card to your hand.'
    default: return o.label.endsWith('.') ? o.label : `${o.label}.`
  }
}
