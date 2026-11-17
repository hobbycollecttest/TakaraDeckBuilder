// Playing a friend at Haikyu through a room code. The server keeps the real match and sends
// each player only what they may see; this keeps the local copy of that picture.
import { DEFS, type Def, type Ev, type Req, type Side, type View } from '../../sim/hq/engine'
import type { Payload as BasePayload } from '../online'

export type Payload = Omit<BasePayload, 'events' | 'view' | 'req'> & { events?: Ev[]; view?: View; req?: Req | null }

const HIDDEN: Def = {
  id: '', no: '', r: '', name: 'Hidden card', jp: '', type: 'Character', aff: '', schools: [], years: [], pos: [],
  text: '', note: '', set: '', artist: '', en: 0,
} as unknown as Def
const emptySide = () => ({ deck: [], hand: [], drop: [], event: [], score: [], serve: [], center: [], sides: [], receive: [], set: [], attack: [] })
const EMPTY = {
  ps: [emptySide(), emptySide()], turn: 0, turnNo: 0, setNo: 0, phase: 'setup', mode: null, serveRight: 0,
  off: [null, null], offKind: ['', ''], def: null, sets: [0, 0], pv: {}, alias: {},
} as unknown as View

export class HQRemote {
  events: Ev[] = []
  req: Req | null = null
  log: { round: number; text: string }[] = []
  s: { cards: Record<number, string>; phase: string; winner: Side | null; reason: string } = { cards: {}, phase: 'setup', winner: null, reason: '' }
  code = ''
  rev = -1
  side: Side = 0
  status: Payload['status'] = 'waiting'
  names: [string, string] = ['', '']
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
    this.log = p.log || []
    Object.assign(this.s.cards, p.cards)
    this.s.phase = p.phase || 'setup'
    this.s.winner = p.winner ?? null
    this.s.reason = p.reason || ''
    return true
  }
  def(uid: number): Def { return DEFS.get(this.s.cards[uid]) || HIDDEN }
  name(uid: number) { return this.view.alias[uid] || this.def(uid).name }
  nm(p: Side) { return this.names[p] }
  snapshot() { return this.view }
}
