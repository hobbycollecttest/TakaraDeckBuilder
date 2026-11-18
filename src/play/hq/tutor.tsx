// The Haikyu tutorial: a full match with the Karasuno and Nekoma Starter Decks, where short
// lessons appear the first time each part of a rally comes up, and the next good move is
// pointed out. Like the HORO-BEAT one, it is the same game every time.
import { AREA_NAME, type Ev, type Opt, type Req, type Side } from '../../sim/hq/engine'
import { HQ_STARTERS } from '../../sim/hq/decks'

export type Team = 'Karasuno' | 'Nekoma'
export type HQTutor = {
  seen: string[]
  onSeen: (key: string) => void
  /** The move we would make in the player's seat, as an option index. */
  suggest: () => number | null
  /** The computer's move. In the tutorial it is the same every time for the same game. */
  cpuPick: () => number
  team: Team
}
export type Lesson = { key: string; title: string; body: string[]; pause: boolean }

// The tutorial is the same game every time: a fixed shuffle for each side, the opening
// hand is always kept, and the computer's choices repeat. These shuffles were picked so
// the player gets the first serve, meets every lesson and wins by following
// the suggested moves.
export const HQ_TUTORIAL_SEED: Record<Team, number> = { Karasuno: 6, Nekoma: 10 }
export const hqTutorialDecks = (team: Team) => ({
  mine: HQ_STARTERS.find((s) => s.team === team)!,
  theirs: HQ_STARTERS.find((s) => s.team !== team)!,
})

type Look = { ev: Ev | null; mine: Req | null; me: Side; seen: string[]; team: Team; hint: Opt | null }

export function hqLessonFor({ ev, mine, me, seen, team }: Look): Lesson | null {
  const fresh = (l: Lesson) => (seen.includes(l.key) ? null : l)
  const { theirs } = hqTutorialDecks(team)

  // Things that happen during play. The match waits while these are open.
  if (ev) {
    if (ev.t === 'judge') return fresh({
      key: 'judge', pause: true, title: 'Stopping the ball',
      body: [
        'Your defense is checked against the other side’s Offense Point. A block uses the Block Points of all your blockers added up. A receive uses your receiver’s Receive Point.',
        'Equal or higher, and the ball is stopped. Lower, and that side loses the set.',
      ],
    })
    if (ev.t === 'lost') return fresh({
      key: 'lost', pause: true, title: 'Losing a set',
      body: [
        'When a block or receive fails, or a player has no character to play, that player declares Lost and the set ends.',
        'The loser takes one of their Score cards into their hand, both players draw back up to 6, and the winner of the set serves next.',
        'Each player starts with 2 Score cards. Declare Lost with none left, and the match is over.',
      ],
    })
    return null
  }

  // Your decisions. These stay open beside the court while you choose.
  if (!mine || mine.p !== me) return null
  const area = mine.opts.find((o) => o.area)?.area
  if (mine.kind === 'mulligan') return fresh({
    key: 'welcome', pause: false, title: 'Welcome to VOBACA!! BREAK',
    body: [
      `You have the ${team} Starter Deck. The computer has the ${theirs.team} Starter Deck.`,
      'Every turn is part of a rally. The ball comes over with an Offense Point, and you have to stop it with a block or a receive that is just as strong. If you can’t, you lose the set.',
      'Here is your opening hand. In a normal match you could swap cards out once. This hand is a good one, so keep it.',
    ],
  })
  if (mine.kind === 'serve') return fresh({
    key: 'first-serve', pause: false, title: 'The first serve',
    body: ['You were picked to decide who serves first. Serving lets you start the rally on your terms, so take it.'],
  })
  if (mine.kind === 'enter' && area === 'serve') return fresh({
    key: 'serve', pause: false, title: 'Serve',
    body: [
      'Every character has five numbers: Serve, Block, Receive, Set and Attack.',
      'To serve, play a character from your hand into your Serve Area. Its Serve Point becomes your Offense Point, and your opponent has to stop it.',
      'Click a card with a gold outline, then click the Serve Area, or drag the card there.',
    ],
  })
  if (mine.kind === 'start') return fresh({
    key: 'start', pause: false, title: 'Block or receive',
    body: [
      'The ball is coming at you. Choose how to stop it.',
      'Block: put up to 3 characters into your Block Area. If their Block Points add up to the Offense Point or more, the ball is stopped.',
      'Receive: draw a card, then play a character whose Receive Point is at least the Offense Point. After a good receive you set and attack, so this is how you build your own offense.',
      'A serve, or a ball sent back by a block, can\u2019t be blocked. Those always have to be received.',
    ],
  })
  if (mine.kind === 'enter' && (area === 'center' || area === 'sides')) return fresh({
    key: 'block', pause: false, title: 'Blocking',
    body: [
      'Your first blocker is the Center Blocker. You can add up to 2 Side Blockers, each with a different name.',
      'Their Block Points are added together. Side Blockers go to the Drop Area after the block, so only add the ones you need.',
    ],
  })
  if (mine.kind === 'enter' && area === 'receive') return fresh({
    key: 'receive', pause: false, title: 'Receive',
    body: [
      'Play a character into your Receive Area. Its Receive Point has to be at least the Offense Point shown at the net.',
      'If you play a character on top of one already in an Area, the old card stays underneath as Guts. Some skills cost Guts.',
    ],
  })
  if (mine.kind === 'enter' && area === 'set') return fresh({
    key: 'set', pause: false, title: 'Set',
    body: [
      'Now set up your attack. Play a character into your Set Area. Its Set Point will be added to your attack.',
      'It can’t have the same name as the character who just received.',
    ],
  })
  if (mine.kind === 'enter' && area === 'attack') return fresh({
    key: 'attack', pause: false, title: 'Attack',
    body: [
      'Play your attacker. Its Attack Point plus your setter’s Set Point is your new Offense Point.',
      'The higher it is, the harder it is for your opponent to stop.',
    ],
  })
  if (mine.kind === 'free') return fresh({
    key: 'free', pause: false, title: 'Events and skills',
    body: [
      'After each step you can play Event cards from your hand. The word in brackets on the card, like [Receive] or [Attack], tells you which phase it works in.',
      'When you are done, press Continue.',
    ],
  })
  if (mine.kind === 'confirm') return fresh({
    key: 'skill', pause: false, title: 'Character skills',
    body: [
      'Some characters have a skill that happens when they enter an Area, like [Enter][Attack Area].',
      'Many skills are optional and ask for a cost, such as paying Guts or discarding a card. You decide whether it is worth it.',
    ],
  })
  return null
}

/** A one-line description of a suggested move. */
export function hqTipFor(o: Opt, name: (uid: number) => string): string {
  const n = o.uid != null ? name(o.uid) : ''
  switch (o.t) {
    case 'keep': return 'Keep this hand.'
    case 'serve': return 'Take the first serve.'
    case 'give': return 'Let the computer serve first.'
    case 'block': return 'Block this one.'
    case 'receive': return 'Receive this one.'
    case 'enter':
      if (o.area === 'center') return `Play ${n} as your Center Blocker.`
      if (o.area === 'sides') return `Add ${n} as a Side Blocker.`
      return `Play ${n} into your ${AREA_NAME[o.area!]}.`
    case 'event': return `Play the Event ${n}.`
    case 'hand': return `Use the skill of ${n}.`
    case 'yes': return 'Yes, use the skill.'
    case 'no': return 'No, skip it.'
    case 'card': return `Choose ${n}.`
    case 'done': return o.label.startsWith('Block') ? `${o.label}.` : 'Continue.'
    default: return o.label.endsWith('.') ? o.label : `${o.label}.`
  }
}
