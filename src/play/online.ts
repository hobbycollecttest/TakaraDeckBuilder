// Playing a friend through a room code. The server holds the real match and sends each
// player only what they may see; this file keeps the local copy of that picture.
import { DEFS, type Def, type Ev, type Req, type Side, type View } from '../sim/engine'
import { store } from '../game'

export type Payload = {
  same?: boolean; gone?: boolean; error?: string
  rev: number; status: 'waiting' | 'playing' | 'over'; code: string; game?: string; side: Side; names: [string, string]
  events?: Ev[]; view?: View; req?: Req | null; turn?: Side | null
  log?: { round: number; text: string }[]; cards?: Record<number, string>; phase?: string; winner?: Side | null; reason?: string
  manualPay?: boolean
}

/** A secret kept in this browser that proves which seat in the room is yours. */
export function seat(): string {
  let s = store.get('hb.seat', '')
  if (!/^[a-f0-9]{32}$/.test(s)) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    s = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    store.set('hb.seat', s)
  }
  return s
}

async function read(res: Response): Promise<Payload> {
  const data = (await res.json().catch(() => ({}))) as Payload
  if (!res.ok) throw new Error(data.error || 'The server could not be reached. Please try again.')
  return data
}
const post = (body: Record<string, unknown>) =>
  fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, seat: seat() }) }).then(read)

export const createRoom = (name: string, deck: string[], game = 'horobeat', manualPay = false) => post({ op: 'create', name, deck, game, manualPay })
export const joinRoom = (code: string, name: string, deck?: string[], game = 'horobeat', manualPay = false) => post({ op: 'join', code, name, deck, game, manualPay })
export const sendChoice = (code: string, rev: number, i: number) => post({ op: 'act', code, rev, i })
export const setRoomPay = (code: string, rev: number, manual: boolean) => post({ op: 'pay', code, rev, manual })
export const leaveRoom = (code: string, rev: number) => post({ op: 'leave', code, rev })
export const checkRoom = (code: string, rev: number) => fetch(`/api/match?code=${code}&seat=${seat()}&rev=${rev}`).then(read)

// Checking in with the server. Every check-in wakes the database, and the database is paid for by
// the time it is awake, so a room nobody is looking at must go quiet:
//   - no check-ins while the tab is in the background
//   - slower check-ins the longer nothing has happened
//   - after 12 minutes with no move and no tap or key press, check-ins stop until the player comes back
const ROOM_IDLE_MS = 12 * 60 * 1000
type Watched = { code: string; rev: number; status: string; req: unknown; apply(p: never): boolean }
export function watchRoom(m: Watched, changed: () => void, paused: (v: boolean) => void) {
  let stop = false
  let timer = 0
  let quiet = 0
  let last = Date.now()
  let asleep = false
  const delay = () => {
    const idle = Date.now() - last
    if (m.status === 'waiting') return idle < 120000 ? 3000 : 8000
    if (m.status === 'playing' && !!m.req) return idle < 300000 ? 12000 : 30000
    return quiet < 40 ? 2500 : quiet < 120 ? 5000 : 10000
  }
  const loop = async () => {
    if (stop || m.status === 'over') return
    if (Date.now() - last > ROOM_IDLE_MS) { asleep = true; paused(true); return }
    if (document.visibilityState === 'visible') {
      try {
        if (m.apply((await checkRoom(m.code, m.rev)) as never)) { quiet = 0; last = Date.now(); changed() } else quiet++
      } catch { quiet++ }
    }
    // The check-in above may have ended the match.
    if (stop || (m.status as string) === 'over') return
    timer = window.setTimeout(loop, delay())
  }
  const wake = () => {
    last = Date.now()
    if (!asleep || stop) return
    asleep = false
    paused(false)
    clearTimeout(timer)
    timer = window.setTimeout(loop, 200)
  }
  const seen = () => { if (document.visibilityState === 'visible') wake() }
  const inputs = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
  inputs.forEach((t) => window.addEventListener(t, wake, { passive: true }))
  document.addEventListener('visibilitychange', seen)
  timer = window.setTimeout(loop, 2500)
  return {
    /** Check again soon, after this player has just done something. */
    kick: () => { wake(); clearTimeout(timer); timer = window.setTimeout(loop, 1500) },
    stop: () => {
      stop = true
      clearTimeout(timer)
      inputs.forEach((t) => window.removeEventListener(t, wake))
      document.removeEventListener('visibilitychange', seen)
    },
  }
}

const HIDDEN: Def = { id: '', name: 'Hidden card', type: 'Horobeat', color: 'Red', cost: 0, power: 0, boost: 0, trigger: '', tribe: '', effect: '', triggerText: '' }
const EMPTY: View = {
  ps: [0, 1].map(() => ({ deck: [], hand: [], hearts: [], check: [], grave: [], ena: [], lines: [null, null, null, null, null], waza: [[], [], [], [], []] })) as unknown as View['ps'],
  first: 0, round: 0, phase: 'setup', active: 0, line: -1, pw: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], dd: [[false, false, false, false, false], [false, false, false, false, false]],
}

export class RemoteMatch {
  events: Ev[] = []
  req: Req | null = null
  log: { round: number; text: string }[] = []
  s: { cards: Record<number, string>; phase: string; winner: Side | null; reason: string } = { cards: {}, phase: 'setup', winner: null, reason: '' }
  code = ''
  rev = -1
  side: Side = 0
  status: Payload['status'] = 'waiting'
  names: [string, string] = ['', '']
  turn: Side | null = null
  /** Whether this player picks their own Ena to pay with. */
  manualPay = false
  private view: View = EMPTY

  constructor(first: Payload) { this.apply(first) }

  /** Take in what the server sent. Returns false when nothing changed. */
  apply(p: Payload): boolean {
    if (p.same) return false
    this.code = p.code
    this.side = p.side
    this.names = p.names
    this.status = p.status
    if (p.status === 'waiting' || !p.view) return true
    this.rev = p.rev
    if (p.events?.length) this.events.push(...p.events)
    this.view = p.view
    this.req = p.req ?? null
    this.turn = p.turn ?? null
    this.manualPay = !!p.manualPay
    this.log = p.log || []
    Object.assign(this.s.cards, p.cards)
    this.s.phase = p.phase || 'summon'
    this.s.winner = p.winner ?? null
    this.s.reason = p.reason || ''
    return true
  }
  def(uid: number): Def { return DEFS.get(this.s.cards[uid]) || HIDDEN }
  name(uid: number) { return this.def(uid).name }
  nm(p: Side) { return this.names[p] }
  snapshot() { return this.view }
}
