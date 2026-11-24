// Haikyu!! VOBACA!! BREAK simulator: lobby and table. The rules live in src/sim/hq.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AREA_NAME, AREA_PARAM, DEFS, HQ, PHASE_LABEL, PNAME, type Area, type Ev, type Opt, type Param, type Setup, type Side, type View as HView } from '../../sim/hq/engine'
import { cpuChoice, LEVELS, tutorChoice, type Level } from '../../sim/hq/ai'
import { HQ_PRACTICE, expandHQ } from '../../sim/hq/decks'
import { play, setSound, unlockSound } from '../sound'
import { useGlide } from '../motion'
import { authReady, currentAccount } from '../../auth'
import { listDecks, type CloudDeck } from '../../cloud'
import { store, type View } from '../../game'
import { createRoom, joinRoom, leaveRoom, sendChoice, watchRoom } from '../online'
import { HQRemote, type Payload } from './online'
import { steadyRandom } from '../tutor'
import { HQ_TUTORIAL_SEED, hqLessonFor, hqTipFor, hqTutorialDecks, type HQTutor, type Team } from './tutor'

type Save = { v: number; setup: Setup; answers: number[]; level: Level; tutorial?: { team: Team; seen: string[] } }
const SAVE_VERSION = 1
const SAVE_KEY = 'haikyu.play'
type Deck = Record<string, number>

const img = (id: string, view: View, large = false) => {
  const d = DEFS.get(id)
  const folder = view === 'en' && d?.en ? 'en' : 'jp'
  return `/cards/haikyu/${folder}${large ? '-lg' : ''}/${id}.webp${d?.v ? `?v=${d.v}` : ''}`
}

type Choice = { key: string; label: string; note: string; ids: string[]; error: string }
function deckChoices(account: CloudDeck[]): Choice[] {
  const out: Choice[] = []
  const add = (key: string, label: string, deck: Deck) => {
    const { ids, error } = expandHQ(deck)
    if (!ids.length) return
    out.push({ key, label, note: error ? `${ids.length}/40 cards` : '', ids, error })
  }
  add('current', store.get('haikyu.name', '') || 'Deck in the builder', store.get<Deck>('haikyu.deck', {}))
  for (const d of account) add(`account:${d.id}`, d.name || 'Untitled deck', d.cards)
  for (const s of store.get<{ id: string; name: string; deck: Deck }[]>('haikyu.saved', [])) add(`saved:${s.id}`, s.name || 'Untitled deck', s.deck)
  for (const p of HQ_PRACTICE) out.push({ key: `practice:${p.team}`, label: p.name, note: '', ids: p.ids, error: '' })
  return out
}
const teamsOf = (ids: string[]) => {
  const n = new Map<string, number>()
  for (const id of ids) for (const s of DEFS.get(id)!.schools) n.set(s, (n.get(s) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s).join(' / ')
}
const face = (ids: string[]) => {
  const best = (id: string) => { const d = DEFS.get(id)!; return d.type === 'Event' ? -1 : (d.at ?? 0) + (d.rc ?? 0) + (d.text ? 2 : 0) }
  return [...new Set(ids)].sort((a, b) => best(b) - best(a))[0]
}

export default function HQPlay() {
  const [save, setSave] = useState<Save | null>(() => {
    const s = store.get<Save | null>(SAVE_KEY, null)
    return s && s.v === SAVE_VERSION ? s : null
  })
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<View>(() => store.get<View>('haikyu.view', 'en'))
  const [matchId, setMatchId] = useState(0)
  const [room, setRoom] = useState<Payload | null>(null)
  useEffect(() => store.set('haikyu.view', view), [view])

  const start = (ids: string[], cpuIds: string[], level: Level) => begin({ v: SAVE_VERSION, setup: { seed: Math.floor(Math.random() * 2 ** 31), decks: [ids, cpuIds], names: ['You', 'CPU'] }, answers: [], level })
  const tutorial = (team: Team) => {
    const { mine, theirs } = hqTutorialDecks(team)
    begin({ v: SAVE_VERSION, setup: { seed: HQ_TUTORIAL_SEED[team], decks: [mine.ids, theirs.ids], names: ['You', 'CPU'] }, answers: [], level: 'easy', tutorial: { team, seen: [] } })
  }
  const begin = (next: Save) => {
    store.set(SAVE_KEY, next)
    setSave(next)
    setMatchId((n) => n + 1)
    setPlaying(true)
  }
  const drop = () => {
    store.set(SAVE_KEY, null)
    setSave(null)
    setPlaying(false)
  }
  return (
    <div className={`app play hq ${(playing && save) || (room && room.status !== 'waiting') ? 'in-match' : ''}`} onPointerDown={unlockSound}>
      <header className="top">
        <a className="brand" href="/haikyu">
          <span className="brand-game">Haikyu!! VOBACA!! BREAK</span>
          <span className="brand-tool">Play</span>
        </a>
        <div className="seg" role="group" aria-label="Card language">
          <button className={view === 'en' ? 'on' : ''} onClick={() => setView('en')}>English</button>
          <button className={view === 'jp' ? 'on' : ''} onClick={() => setView('jp')}>日本語</button>
        </div>
        {playing ? <button className="signin" onClick={() => setPlaying(false)}>Menu</button> : room ? null : <a className="signin" href="/haikyu">Deck builder</a>}
      </header>
      {room ? (
        <Room key={room.code} first={room} view={view} onExit={() => { store.set('haikyu.room', ''); setRoom(null) }} />
      ) : playing && save ? (
        <LocalTable key={matchId} save={save} view={view} onAgain={() => start(save.setup.decks[0], save.setup.decks[1], save.level)}
          onSwap={save.tutorial ? () => tutorial(save.tutorial!.team === 'Karasuno' ? 'Nekoma' : 'Karasuno') : undefined} onMenu={drop} />
      ) : (
        <Lobby save={save} view={view} onResume={() => setPlaying(true)} onStart={start} onTutorial={tutorial} onRoom={(p) => { store.set('haikyu.room', p.code); setRoom(p) }} />
      )}
    </div>
  )
}

function Lobby({ save, view, onResume, onStart, onTutorial, onRoom }: { save: Save | null; view: View; onResume: () => void; onStart: (ids: string[], cpuIds: string[], level: Level) => void; onTutorial: (team: Team) => void; onRoom: (p: Payload) => void }) {
  const [account, setAccount] = useState<CloudDeck[]>([])
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    currentAccount()
      .then((a) => {
        if (!live) return
        setSignedIn(!!a)
        if (a) return listDecks('haikyu').then((r) => live && setAccount(r.decks))
      })
      .catch(() => live && setSignedIn(false))
    return () => { live = false }
  }, [])
  const choices = useMemo(() => deckChoices(account), [account])
  const [mine, setMine] = useState(() => (choices.find((c) => !c.error) || choices[0]).key)
  const picked = choices.find((c) => c.key === mine) || choices[choices.length - 1]
  const [theirs, setTheirs] = useState('random')
  const [level, setLevel] = useState<Level>('normal')
  // Playing a friend.
  const [name, setName] = useState(() => store.get('haikyu.pname', '') || store.get('hb.pname', ''))
  const [code, setCode] = useState(() => (new URLSearchParams(location.hash.slice(1)).get('room') || '').toUpperCase().slice(0, 5))
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const lastRoom = store.get('haikyu.room', '')
  const online = async (what: 'create' | 'join' | 'rejoin') => {
    setProblem('')
    setBusy(what)
    store.set('haikyu.pname', name.trim())
    try {
      const who = name.trim() || 'Player'
      const p = what === 'create' ? await createRoom(who, picked.ids, 'haikyu') : what === 'join' ? await joinRoom(code, who, picked.ids, 'haikyu') : await joinRoom(lastRoom, who, undefined, 'haikyu')
      onRoom(p as unknown as Payload)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      if (what === 'rejoin') store.set('haikyu.room', '')
    }
    setBusy('')
  }
  const canResume = useMemo(() => {
    if (!save) return false
    try { return HQ.replay(save.setup, save.answers).s.phase !== 'over' } catch { return false }
  }, [save])
  // The player's own playable decks, which the CPU can also be given.
  const own = choices.filter((c) => !c.key.startsWith('practice:') && !c.error)
  const go = () => {
    const cpu = own.find((c) => c.key === theirs) || HQ_PRACTICE.find((p) => p.team === theirs) || HQ_PRACTICE[Math.floor(Math.random() * HQ_PRACTICE.length)]
    onStart(picked.ids, cpu.ids, level)
  }
  return (
    <main className="lobby">
      <h1>Play Haikyu!! VOBACA!! BREAK</h1>
      <p className="lede">A full match with the official rules, right in your browser: serve, block or receive, set, attack, and fight for every set until someone runs out of Score cards.</p>
      {canResume ? (
        <div className="resume">
          <span>{save?.tutorial ? 'You have a tutorial in progress.' : 'You have a match in progress.'}</span>
          <button className="btn" onClick={onResume}>Resume match</button>
        </div>
      ) : null}
      <section className="learn">
        <div className="learn-decks" aria-hidden="true">
          <img src={img('hv-d01-001-d', view)} alt="" />
          <img src={img('hv-d02-001-d', view)} alt="" />
        </div>
        <div className="learn-text">
          <h2>Learn by playing</h2>
          <p>New to VOBACA!! BREAK? Play a guided match with the two Starter Decks. Short tips explain each part of a rally the first time it comes up, and the next good move is pointed out for you.</p>
          <div className="learn-actions">
            <button className="btn" onClick={() => onTutorial('Karasuno')}>Play as Karasuno</button>
            <button className="btn" onClick={() => onTutorial('Nekoma')}>Play as Nekoma</button>
          </div>
          <p className="fine">Karasuno Starter Deck against Nekoma Starter Deck. The computer plays the other school.</p>
        </div>
      </section>
      <div className="lobby-cols">
        <section>
          <h2>Your deck</h2>
          <ul className="deck-list">
            {choices.map((c) => (
              <li key={c.key}>
                <button className={`deck-pick ${c.key === mine ? 'on' : ''}`} disabled={!!c.error} onClick={() => setMine(c.key)} title={c.error}>
                  <img src={img(face(c.ids), view)} alt="" loading="lazy" />
                  <span className="deck-pick-name">{c.label}</span>
                  <span className="deck-pick-note">{c.note || teamsOf(c.ids)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="fine">
            {signedIn === false && authReady
              ? <>Your saved decks appear here once you <a href="/haikyu">sign in on the deck builder</a>. Decks need exactly 40 cards with no more than 8 Events.</>
              : <>Decks from your account and from the <a href="/haikyu">deck builder</a> show up here once they have 40 cards.</>}
          </p>
        </section>
        <section>
          <h2>Play the computer</h2>
          <div className="field-row">
            <span>CPU deck</span>
            <select className="pick" aria-label="CPU deck" value={own.some((c) => c.key === theirs) || !theirs.includes(':') ? theirs : 'random'} onChange={(e) => setTheirs(e.target.value)}>
              <optgroup label="Practice decks">
                <option value="random">Random school</option>
                {HQ_PRACTICE.map((p) => <option key={p.team} value={p.team}>{p.team}</option>)}
              </optgroup>
              {own.length ? (
                <optgroup label="Your decks">
                  {own.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div className="field-row">
            <span>Difficulty</span>
            <div className="seg small levels">
              {LEVELS.map((l) => (
                <button key={l.id} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>{l.label}</button>
              ))}
            </div>
          </div>
          <button className="btn start" onClick={go} disabled={!!picked.error}>Start match</button>
          <p className="fine">The CPU follows the same rules you do. It never sees your hand or the order of either deck. On Hard and Expert it thinks ahead by imagining the cards you might be holding and playing each choice out, so it takes a moment longer.</p>
          <p className="fine">New to the game? The <a href="/haikyu/rules">rules page</a> explains a rally in a few minutes.</p>
          <h2 className="friend-title">Play a friend</h2>
          <div className="field-row">
            <label htmlFor="pname">Your name</label>
            <input id="pname" className="text" value={name} maxLength={16} placeholder="Player" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="friend-actions">
            <button className="btn" onClick={() => online('create')} disabled={!!picked.error || !!busy}>{busy === 'create' ? 'Making room…' : 'Create a room'}</button>
            <span>or</span>
            <input className="text code" value={code} maxLength={5} placeholder="CODE" aria-label="Room code" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button className="btn" onClick={() => online('join')} disabled={!!picked.error || !!busy || code.length !== 5}>{busy === 'join' ? 'Joining…' : 'Join'}</button>
          </div>
          {lastRoom ? <p className="fine">You were in room {lastRoom}. <button className="linkish" onClick={() => online('rejoin')} disabled={!!busy}>Go back to it</button></p> : null}
          {problem ? <p className="fine problem">{problem}</p> : null}
          <p className="fine">Create a room and send the code to your friend. They pick a deck, type the code and join. Both of you use the deck selected on the left.</p>
        </section>
      </div>
    </main>
  )
}

/** A match against a friend, kept on the server and joined with a room code. */
function Room({ first, view, onExit }: { first: Payload; view: View; onExit: () => void }) {
  const ref = useRef<HQRemote | null>(null)
  if (!ref.current) ref.current = new HQRemote(first)
  const m = ref.current
  const [version, setVersion] = useState(0)
  const [sure, setSure] = useState(false)
  const [copied, setCopied] = useState(false)
  const kick = useRef<() => void>(() => {})

  // Check in with the server. watchRoom slows down and then stops when nobody is there.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const w = watchRoom(m, () => setVersion((n) => n + 1), setPaused)
    kick.current = w.kick
    return w.stop
  }, [])

  const act = async (i: number) => {
    m.apply((await sendChoice(m.code, m.rev, i)) as unknown as Payload)
    setVersion((n) => n + 1)
    kick.current()
  }
  const leave = async () => {
    try {
      const p = await leaveRoom(m.code, m.rev)
      if (!p.gone) m.apply(p as unknown as Payload)
    } catch { /* leaving anyway */ }
    onExit()
  }
  const link = `${location.origin}/haikyu/play#room=${m.code}`

  if (m.status === 'waiting') {
    return (
      <main className="lobby waiting">
        <h1>Room code</h1>
        <p className="room-code">{m.code}</p>
        <p className="lede">Send this code to your friend. The match starts as soon as they join.</p>
        <div className="friend-actions">
          <button className="btn" onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)) }}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <button className="ghost" onClick={leave}>Cancel</button>
        </div>
        <p className="fine">{paused ? 'Paused to save power. Tap anywhere to keep waiting.' : 'Waiting for the other player…'}</p>
      </main>
    )
  }
  const foe = (1 - m.side) as Side
  return (
    <Table m={m} me={m.side} view={view} version={version} onAct={act} waitText={paused ? 'Paused. Tap anywhere to check again.' : `Waiting for ${m.nm(foe)}…`}
      after={<button className="btn" onClick={onExit}>Back to menu</button>}
      extra={m.status === 'over' ? null : <button className="ctl" onClick={() => (sure ? leave() : setSure(true))} onBlur={() => setSure(false)}>{sure ? 'Leave and lose?' : `Room ${m.code}`}</button>} />
  )
}

/** A match against the computer. It lives entirely in this browser. */
function LocalTable({ save, view, onAgain, onSwap, onMenu }: { save: Save; view: View; onAgain: () => void; onSwap?: () => void; onMenu: () => void }) {
  const ref = useRef<HQ | null>(null)
  if (!ref.current) {
    ref.current = HQ.replay(save.setup, save.answers)
    ref.current.record = true
  }
  const m = ref.current
  const [seen, setSeen] = useState(() => save.tutorial?.seen || [])
  const seenRef = useRef(seen)
  const keep = () => store.set(SAVE_KEY, { ...save, answers: m.answers, tutorial: save.tutorial && { ...save.tutorial, seen: seenRef.current } })
  const send = (i: number) => {
    m.answer(i)
    keep()
  }
  const tutor: HQTutor | undefined = save.tutorial && {
    seen,
    team: save.tutorial.team,
    onSeen: (key) => {
      if (seenRef.current.includes(key)) return
      seenRef.current = [...seenRef.current, key]
      setSeen(seenRef.current)
      keep()
    },
    suggest: () => (m.req && m.req.p === 0 ? (m.req.kind === 'mulligan' ? m.req.opts.findIndex((o) => o.t === 'keep') : tutorChoice(m)) : null),
    cpuPick: () => cpuChoice(m, 'easy', steadyRandom(save.setup.seed, m.answers.length)),
  }
  return (
    <Table m={m} me={0} view={view} onAct={send} cpu={save.level} waitText="The computer is thinking…" tutor={tutor}
      after={onSwap
        ? <><button className="btn" onClick={onSwap}>Try {save.tutorial!.team === 'Karasuno' ? 'Nekoma' : 'Karasuno'}</button><button className="ghost" onClick={onMenu}>Back to menu</button></>
        : <><button className="btn" onClick={onAgain}>Play again</button><button className="ghost" onClick={onMenu}>Change decks</button></>} />
  )
}

// How long each kind of event stays on screen at normal speed, in milliseconds.
const PACE: Record<string, number> = {
  set: 1500, phase: 820, choose: 700, enter: 720, judge: 1550, received: 800, blocked: 1100, off: 1100, event: 1250, skill: 1150, keyword: 1400,
  draw: 380, add: 520, drop: 420, discard: 450, mill: 520, pump: 640, cut: 640, pay: 480, reveal: 1000, coin: 1000, lost: 1500, interval: 1400, score: 700, victory: 2400, note: 520,
}
const SOUND: Record<string, string> = {
  set: 'whistle', phase: 'line', enter: 'summon', event: 'waza', skill: 'waza', keyword: 'trigger', draw: 'draw', add: 'draw', drop: 'down', discard: 'down',
  mill: 'draw', pump: 'recover', cut: 'down', pay: 'charge', reveal: 'trigger', coin: 'click', lost: 'heartbreak', interval: 'whistle', score: 'charge', blocked: 'block',
}
const CALM = 0.55
const PHASES: [HView['phase'], string][] = [['serve', 'Serve'], ['block', 'Block'], ['draw', 'Draw'], ['receive', 'Receive'], ['set', 'Set'], ['attack', 'Attack'], ['end', 'End']]
// The board follows the layout of the official play sheet: Block across the net, Receive, Set and
// Attack in the middle, Serve and Event along the back, Score cards on the left, Deck and Drop on the right.
// Positions are percent of the sheet (left, top, width, height) for the player who owns it, net at the top.
type Spot = 'center' | 'side0' | 'side1' | 'receive' | 'set' | 'attack' | 'serve' | 'event' | 'score' | 'deck' | 'drop' | 'band' | 'logo'
const BOX: Record<Spot, [number, number, number, number]> = {
  band: [13, 0, 74, 32.5],
  side0: [15, 1.5, 22, 29.5], center: [39, 1.5, 22, 29.5], side1: [63, 1.5, 22, 29.5],
  receive: [15, 35, 22, 31.5], set: [39, 35, 22, 31.5], attack: [63, 35, 22, 31.5],
  logo: [15, 69, 22, 31], serve: [39, 69, 22, 31], event: [63, 69, 22, 31],
  score: [1, 1.5, 11, 64], deck: [88, 1.5, 11, 46], drop: [88, 50.5, 11, 49.5],
}
const LABEL: Partial<Record<Spot, string>> = { center: 'Center Blocker', side0: 'Side Blocker', side1: 'Side Blocker', receive: 'Receive', set: 'Set', attack: 'Attack', serve: 'Serve', event: 'Event', score: 'Score', deck: 'Deck', drop: 'Drop' }
/** The opponent's sheet is turned around, so their Areas mirror yours across the net. */
const boxStyle = (k: Spot, mine: boolean): React.CSSProperties => {
  const [l, tp, w, h] = BOX[k]
  return { left: `${mine ? l : 100 - l - w}%`, top: `${mine ? tp : 100 - tp - h}%`, width: `${w}%`, height: `${h}%` }
}
const P_SHORT: Record<Param, string> = { sv: 'SV', bl: 'BL', rc: 'RC', st: 'ST', at: 'AT' }

/** A number that counts to its new value instead of jumping. */
function Num({ value, spd, className = '' }: { value: number; spd: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const at = useRef(value)
  useEffect(() => {
    const from = at.current
    if (from === value) { setShown(value); return }
    const t0 = performance.now()
    const dur = 480 / spd
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      at.current = from + (value - from) * (1 - (1 - k) * (1 - k))
      setShown(k < 1 ? Math.round(at.current) : value)
      if (k < 1) raf = requestAnimationFrame(step)
      else at.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const moving = shown !== value
  return <b className={`${className} ${moving ? (value > shown ? 'rising' : 'falling') : ''}`}>{shown}</b>
}

/** What the table needs from a match, whether it runs here against the computer or on the server against a friend. */
type TableMatch = {
  events: Ev[]
  req: HQ['req']
  log: { round: number; text: string }[]
  s: { cards: Record<number, string> | string[]; phase: string; winner: Side | null; reason: string }
  name(uid: number): string
  def(uid: number): ReturnType<HQ['def']>
  nm(p: Side): string
  snapshot(): HView
}

function Table({ m, me, view, version = 0, onAct, cpu, waitText, after, extra, tutor }: {
  m: TableMatch; me: Side; view: View; version?: number; onAct: (i: number) => void | Promise<void>; cpu?: Level; waitText: string; after: React.ReactNode; extra?: React.ReactNode; tutor?: HQTutor
}) {
  const foe = (1 - me) as Side
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [tick, setTick] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [speed, setSpeed] = useState(() => store.get('haikyu.speed', 1))
  const [sound, setSoundOn] = useState(() => store.get('haikyu.sound', true))
  const [sel, setSel] = useState<number | null>(null)
  const [look, setLook] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const [pile, setPile] = useState<{ title: string; uids: number[] } | null>(null)
  // Cards ticked so far when several are chosen in one go (opening hand, Guts to pay).
  const [marked, setMarked] = useState<number[]>([])
  const [sure, setSure] = useState(false)
  const logRef = useRef<HTMLOListElement>(null)
  const tableRef = useRef<HTMLElement>(null)
  const ghostRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ uid: number; x0: number; y0: number; on: boolean } | null>(null)
  const dropRef = useRef<(uid: number, where: string) => void>(() => {})
  const justDragged = useRef(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [intro, setIntro] = useState(() => m.log.length <= 6 && m.s.phase !== 'over')
  const [resultOpen, setResultOpen] = useState(true)

  const spd = speed * CALM
  const ev: Ev | null = cursor < m.events.length ? m.events[cursor] : null
  const playing = !!ev
  const v = useMemo(() => (ev ? ev.view : m.snapshot()), [ev, tick, version])
  const req = m.req
  const mine = !playing && req && req.p === me ? req : null
  const over = !playing && m.s.phase === 'over'
  // The tutorial's lesson for this moment, and the move it suggests.
  const hint = useMemo(() => (tutor && mine && !busy ? tutor.suggest() : null), [mine, busy, tick, version, cursor])
  const hintOpt = hint != null && mine ? mine.opts[hint] : null
  const lesson = tutor && !intro ? hqLessonFor({ ev, mine, me, seen: tutor.seen, team: tutor.team, hint: hintOpt }) : null

  useGlide(tableRef, v, spd)
  useEffect(() => {
    if (!intro) return
    play('whistle')
    const t = setTimeout(() => setIntro(false), 2400)
    return () => clearTimeout(t)
  }, [intro])
  useEffect(() => { store.set('haikyu.speed', speed) }, [speed])
  useEffect(() => { store.set('haikyu.sound', sound); setSound(sound) }, [sound])
  useEffect(() => setSure(false), [tick])

  const act = async (i: number) => {
    if (busy) return
    if (lesson && !lesson.pause) tutor!.onSeen(lesson.key)
    unlockSound()
    setProblem('')
    setBusy(true)
    try { await onAct(i) } catch (e) { setProblem(e instanceof Error ? e.message : 'That did not go through. Please try again.') }
    setBusy(false)
    setSel(null)
    setTick((n) => n + 1)
  }
  /** Several answers in a row, for choosing a few cards in one go. Each step reads the question as it stands. */
  const actMany = async (steps: (() => number)[]) => {
    if (busy) return
    unlockSound()
    setProblem('')
    setBusy(true)
    try {
      for (const step of steps) {
        const i = step()
        if (i < 0) break
        await onAct(i)
      }
    } catch (e) { setProblem(e instanceof Error ? e.message : 'That did not go through. Please try again.') }
    setBusy(false)
    setSel(null)
    setMarked([])
    setTick((n) => n + 1)
  }
  const optAt = (test: (o: NonNullable<HQ['req']>['opts'][number]) => boolean) => () => (m.req && m.req.p === me ? m.req.opts.findIndex(test) : -1)
  const skip = () => setCursor(m.events.length)

  // Step through what just happened, with a sound for each event.
  useEffect(() => {
    if (!ev || intro || lesson?.pause) return
    let sfx = SOUND[ev.t]
    if (ev.t === 'judge') sfx = ev.win ? 'bump' : 'damage'
    if (ev.t === 'off' && /Offense Point: /.test(ev.text)) sfx = /Serve Offense/.test(ev.text) ? 'serve' : /Attack Offense/.test(ev.text) ? 'spike' : 'block'
    else if (ev.t === 'off') sfx = 'line'
    if (ev.t === 'victory') sfx = ev.p === me ? 'win' : 'lose'
    if (ev.t === 'interval') sfx = ev.p === me ? 'cheer' : 'whistle'
    if (sfx) play(sfx)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const base = PACE[ev.t] ?? PACE.note
    const t = setTimeout(() => setCursor((c) => c + 1), calm ? Math.min(base, 260) : base / spd)
    return () => clearTimeout(t)
  }, [cursor, ev, speed, intro, lesson?.key])
  // Once the table has caught up, the computer makes its next choice.
  useEffect(() => {
    if (playing || intro || !cpu || !m.req || m.req.p !== foe) return
    const t = setTimeout(() => act(tutor ? tutor.cpuPick() : cpuChoice(m as HQ, cpu)), 480 / spd)
    return () => clearTimeout(t)
  }, [tick, playing, speed, intro])
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [cursor, tick])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setZoom(false); setPile(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const opts = mine ? mine.opts.map((o, i) => ({ ...o, i })) : []
  const cardOpts = (uid: number) => opts.filter((o) => o.uid === uid)
  const P0 = v.ps[me]
  const inHand = (u: number) => P0.hand.includes(u)
  // Only the top card of each Area shows on the sheet. Guts underneath are hidden, so they go in the tray.
  const onCourt = (u: number) => ([0, 1] as Side[]).some((s) => v.ps[s].sides.includes(u) || (['serve', 'center', 'receive', 'set', 'attack'] as Area[]).some((a) => { const l = v.ps[s][a]; return l[l.length - 1] === u }))
  /** For a Guts card, the Area it sits under, so the tray can say where it came from. */
  const gutsArea = (u: number) => {
    for (const s of [0, 1] as Side[]) for (const a of ['serve', 'center', 'receive', 'set', 'attack'] as Area[]) {
      const l = v.ps[s][a]
      if (l.includes(u) && l[l.length - 1] !== u) return AREA_NAME[a].replace(' Area', '')
    }
    return ''
  }
  // Cards to choose from that are not in your hand or showing on the court are laid out in a tray.
  const tray = mine ? [...new Set([...(mine.show || []).filter((u) => !inHand(u) || mine.kind !== 'free'), ...opts.filter((o) => o.uid != null && !inHand(o.uid) && !onCourt(o.uid)).map((o) => o.uid!)])] : []
  const only = mine && mine.kind !== 'free' && mine.kind !== 'enter' ? [...new Set(opts.filter((o) => o.uid != null).map((o) => o.uid!))] : []
  const chosen = sel != null && cardOpts(sel).length ? sel : only.length === 1 ? only[0] : null
  const chosenOpts = chosen != null ? cardOpts(chosen) : []
  const bigOpt = opts.find((o) => o.uid == null && o.t === 'done')
  const lostOpt = opts.find((o) => o.t === 'lost')
  const plain = opts.filter((o) => o.uid == null && o !== bigOpt && o !== lostOpt)

  const show = (uid: number) => setLook(m.s.cards[uid])
  const peek = (uid: number) => {
    show(uid)
    if (window.innerWidth < 1000) setZoom(true)
  }
  // Dragging a card from the hand onto an Area plays it there.
  dropRef.current = (uid, where) => {
    const list = cardOpts(uid)
    const o = list.find((x) => x.area === where || (where === 'center' && x.area === 'sides')) || (where === 'event' ? list.find((x) => x.t === 'event' || x.t === 'hand') : undefined)
    if (o) void act(o.i)
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 12) return
        d.on = true
        setSel(d.uid)
        setDragging(d.uid)
        setLook(m.s.cards[d.uid])
      }
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -62%) rotate(${Math.max(-10, Math.min(10, e.movementX))}deg)`
      e.preventDefault()
    }
    const up = (e: PointerEvent) => {
      const d = drag.current
      drag.current = null
      if (!d || !d.on) return
      setDragging(null)
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 80)
      const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]')
      if (hit) dropRef.current(d.uid, hit.dataset.drop!)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])
  // Paying two or more Guts: tick them all, then pay once.
  const gutsAsk = mine && mine.kind === 'pick' ? mine.text.match(/^Choose Guts to pay \((\d+) of (\d+)\)/) : null
  const gutsNeed = gutsAsk ? Math.min(+gutsAsk[2] - +gutsAsk[1] + 1, opts.filter((o) => o.t === 'card').length) : 0
  const gutsMany = gutsNeed >= 2 && !tutor
  const toggle = (uid: number, max: number) => setMarked((list) => (list.includes(uid) ? list.filter((u) => u !== uid) : list.length < max ? [...list, uid] : list))
  const payMarked = () => actMany(marked.map((u) => optAt((o) => o.t === 'card' && o.uid === u)))
  const putBack = () => actMany([optAt((o) => o.t === 'pick'), ...marked.map((u) => optAt((o) => o.t === 'card' && o.uid === u)), optAt((o) => o.t === 'no')])
  const pickCard = (uid: number) => {
    if (justDragged.current) return
    unlockSound()
    play('click')
    show(uid)
    if (gutsMany && cardOpts(uid).length) return toggle(uid, gutsNeed)
    setSel(cardOpts(uid).length ? uid : null)
  }
  const nm = (side: Side) => m.nm(side)
  const lookDef = look ? DEFS.get(look)! : null
  const nameOf = (u: number) => v.alias[u] || m.def(u).name
  // The area the current choice is about, so it can light up.
  const askArea = mine && mine.kind === 'enter' ? opts.find((o) => o.area)?.area : undefined

  /** The character on top of one Area, its number for that Area, and its Guts. */
  const spot = (side: Side, key: Spot, area: Area | null, list: number[], extra = '') => {
    const top = list.length ? list[list.length - 1] : null
    const k = area ? AREA_PARAM[area] : null
    const n = top != null && k ? v.pv[top]?.[k] ?? null : null
    const live = area && v.turn === side && ((area === 'serve' && v.phase === 'serve') || ((area === 'center' || area === 'sides') && v.phase === 'block') || (area === 'receive' && v.phase === 'receive') || (area === 'set' && v.phase === 'set') || (area === 'attack' && v.phase === 'attack'))
    const target = side === me && askArea && area && (askArea === area || (area === 'sides' && askArea === 'sides' && !top))
    const fx = ev && ev.t === 'enter' && ev.uid != null && list.includes(ev.uid) ? 'fx-enter' : ev && (ev.t === 'pump' || ev.t === 'cut') && ev.uid === top ? `fx-${ev.t}` : ''
    const pick = top != null ? opts.find((o) => o.uid === top && o.t === 'card') : undefined
    const hinted = side === me && hintOpt && ((target && hintOpt.t === 'enter' && hintOpt.area === area && chosen === hintOpt.uid) || (pick && pick.i === hint))
    return (
      <div key={key} data-label={LABEL[key]} className={`spot z-${key} ${live ? 'live' : ''} ${target ? 'target' : ''} ${pick ? 'pickable' : ''} ${hinted ? 'hint' : ''} ${fx} ${extra}`} style={boxStyle(key, side === me)}
        data-drop={side === me && area ? (area === 'sides' ? 'center' : area) : undefined}
        onClick={() => (pick ? act(pick.i) : top != null ? peek(top) : undefined)} role={pick || top != null ? 'button' : undefined}>
        {top != null ? (
          <span key={top} className="pcard" data-uid={top} data-side={side} onMouseEnter={() => show(top)}>
            <img src={img(m.s.cards[top], view)} alt={nameOf(top)} draggable={false} />
            {v.alias[top] ? <span className="alias">{v.alias[top]}</span> : null}
            {n != null && k ? <span className="param"><i>{P_SHORT[k]}</i><Num value={n} spd={spd} /></span> : null}
            {list.length > 1 ? (
              <button className="guts" title="See the Guts: cards under the character, paid as costs"
                onClick={(e) => { e.stopPropagation(); setPile({ title: `Guts under ${nameOf(top)} (${nm(side)}${area ? `, ${AREA_NAME[area].replace(' Area', '')}` : ''})`, uids: list.slice(0, -1).reverse() }) }}>
                {list.length - 1} Guts
              </button>
            ) : null}
          </span>
        ) : null}
        {fx === 'fx-enter' ? <i className="ring" /> : null}
        {(fx === 'fx-pump' || fx === 'fx-cut') && ev ? <b className={`float ${fx === 'fx-pump' ? 'gain' : 'hit'}`}>{ev.text.match(/[+−-]\d+/)?.[0] ?? ''}</b> : null}
      </div>
    )
  }

  /** One player's play sheet, laid out like the official one. */
  const sheet = (side: Side) => {
    const P = v.ps[side]
    const mineSide = side === me
    const dropTop = P.drop[P.drop.length - 1]
    const evFx = ev && ev.p === side && (ev.t === 'event' || ev.t === 'skill') ? 'fx-event' : ''
    const evTarget = mineSide && chosenOpts.some((o) => o.t === 'event' || o.t === 'hand')
    // A Side Blocker sits in each side box; the first one goes on the left.
    const sideList = (i: number) => (P.sides[i] != null ? [P.sides[i]] : [])
    const evOff = Math.min(26, 74 / Math.max(1, P.event.length - 1))
    return (
      <section className={`sheet ${mineSide ? 'mine' : 'theirs'} ${v.turn === side && v.phase !== 'end' && v.phase !== 'setup' ? 'active' : ''}`}>
        <div className="spot z-band" style={boxStyle('band', mineSide)}><span>Block</span></div>
        <div className="spot z-logo" style={boxStyle('logo', mineSide)}><img src="/sim/hq-logo.svg" alt="" draggable={false} /></div>
        {spot(side, 'center', 'center', P.center)}
        {spot(side, 'side0', 'sides', sideList(0), 'small-num')}
        {spot(side, 'side1', 'sides', sideList(1), 'small-num')}
        {spot(side, 'receive', 'receive', P.receive)}
        {spot(side, 'set', 'set', P.set)}
        {spot(side, 'attack', 'attack', P.attack)}
        {spot(side, 'serve', 'serve', P.serve)}
        <div key={evFx ? `ev${cursor}` : 'ev'} data-label="Event" className={`spot z-event events ${evFx} ${evTarget ? 'target' : ''} ${evTarget && hintOpt && (hintOpt.t === 'event' || hintOpt.t === 'hand') && chosen === hintOpt.uid ? 'hint' : ''}`} style={boxStyle('event', mineSide)} data-drop={mineSide ? 'event' : undefined}
          onClick={() => { const o = evTarget ? chosenOpts.find((x) => x.t === 'event' || x.t === 'hand') : undefined; if (o) void act(o.i); else if (P.event.length) setPile({ title: `${nm(side)}: Event Area`, uids: [...P.event].reverse() }) }}>
          {P.event.map((u, i) => (
            <span key={u} className="ecard" data-uid={u} data-side={side} style={{ left: `${i * evOff}%` }} onMouseEnter={() => show(u)}>
              <img src={img(m.s.cards[u], view)} alt={m.name(u)} title={m.name(u)} draggable={false} />
            </span>
          ))}
          {P.event.length ? <b className="count">{P.event.length}</b> : null}
        </div>
        <div key={ev && ev.t === 'score' && ev.p === side ? `sc${cursor}` : 'sc'} data-label="Score" className={`spot z-score score ${ev && ev.t === 'score' && ev.p === side ? 'fx-score' : ''}`} style={boxStyle('score', mineSide)} title="Score cards">
          {P.score.map((u, i) => <i key={u} className="cb" data-uid={u} data-side={side} style={{ marginTop: i ? '-62%' : 0 }} />)}
          <b className="count">{P.score.length}</b>
        </div>
        <div key={ev && ev.t === 'draw' && ev.p === side ? `d${cursor}` : 'd'} data-label="Deck" className={`spot z-deck deck ${ev && ev.t === 'draw' && ev.p === side ? 'fx-draw' : ''}`} style={boxStyle('deck', mineSide)} title="Deck">
          {P.deck.length ? <i className="cb" data-deck={side} /> : <i className="cb none" data-deck={side} />}
          <b className="count">{P.deck.length}</b>
        </div>
        <button data-label="Drop" className="spot z-drop drop" style={boxStyle('drop', mineSide)} disabled={!P.drop.length} onClick={() => setPile({ title: `${nm(side)}: Drop Area`, uids: [...P.drop].reverse() })} title="Drop Area">
          {dropTop != null ? <img data-uid={dropTop} data-side={side} src={img(m.s.cards[dropTop], view)} alt="" draggable={false} /> : null}
          <b className="count">{P.drop.length}</b>
        </button>
      </section>
    )
  }

  const offOf = (side: Side) => v.off[side]
  // The log only shows what has already been played back on the table.
  const shown = m.log.length - (m.events.length - cursor)
  const sets: { round: number; lines: string[] }[] = []
  for (const l of m.log.slice(0, shown)) {
    const last = sets[sets.length - 1]
    if (last && last.round === l.round) last.lines.push(l.text)
    else sets.push({ round: l.round, lines: [l.text] })
  }

  const who = v.turn === me ? 'Your' : `${nm(foe)}'s`
  const step = v.setNo === 0 || v.phase === 'setup' ? 'Getting ready' : v.phase === 'start' ? `${who} turn: block or receive` : v.phase === 'over' ? 'Match over' : `${who} ${PHASE_LABEL[v.phase]}`
  const banner = ev && ['set', 'phase', 'keyword', 'lost', 'interval', 'victory', 'blocked', 'coin'].includes(ev.t)
    ? ev.t === 'set' ? { big: `Set ${v.setNo}`, small: `${nm(v.serveRight)} ${v.serveRight === me ? 'serve' : 'serves'}` }
    : ev.t === 'phase' ? { big: PHASE_LABEL[v.phase], small: v.turn === me ? 'Your turn' : `${nm(foe)}'s turn` }
    : ev.t === 'keyword' ? { big: ev.text.replace(/[!:.].*$/, ''), small: ev.text.replace(/^[^!:.]*[!:.]\s*/, '').replace(/\.$/, '') }
    : ev.t === 'lost' ? { big: 'Lost', small: ev.text.replace(/^.*?declares Lost\.\s*/, '').replace(/\.$/, '') }
    : ev.t === 'interval' ? { big: ev.p === me ? 'You take the set' : `${nm(ev.p!)} takes the set`, small: `Sets ${v.sets[me]} – ${v.sets[foe]}` }
    : ev.t === 'victory' ? { big: ev.p === me ? 'You win' : 'You lose', small: 'Match point' }
    : ev.t === 'blocked' ? { big: 'Blocked!', small: ev.p === me ? 'Shut down' : `${nm(ev.p!)} shuts it down` }
    : { big: ev.text.replace(/\.$/, ''), small: '' }
    : null
  // The ball crosses the net whenever someone declares an Offense Point.
  const ball = ev && ev.t === 'off' && /Offense Point: /.test(ev.text) ? (ev.p === me ? 'up' : 'down') : null
  const lostSure = () => { if (!lostOpt) return; if (sure) void act(lostOpt.i); else setSure(true) }

  return (
    <main ref={tableRef} className="table hq-table" onPointerDown={unlockSound} style={{ '--spd': spd } as React.CSSProperties}>
      <div className="hq-info">
        <div className="who theirs">
          <span className="who-name">{nm(foe)}</span>
          {v.serveRight === foe && v.phase !== 'over' && v.phase !== 'setup' ? <em>Serve right</em> : null}
          <span className="who-stat">Hand <b>{v.ps[foe].hand.length}</b></span>
          <div className="cpu-hand" aria-label={`${nm(foe)}'s hand: ${v.ps[foe].hand.length} cards`}>
            {v.ps[foe].hand.map((u) => <i key={u} className="cb" data-uid={u} data-side={foe} />)}
          </div>
        </div>
        <div className="phases" aria-live="polite">
          <span className="phase-set">Set <b>{Math.max(v.setNo, 1)}</b></span>
          <ol>
            {PHASES.map(([key, label]) => <li key={key} className={v.phase === key ? 'on' : ''}>{label}</li>)}
          </ol>
          <span className="phase-step">{step}</span>
        </div>
        <div className="controls">
          <div className="seg" role="group" aria-label="Animation speed">
            {[1, 2, 3].map((n) => <button key={n} className={speed === n ? 'on' : ''} onClick={() => setSpeed(n)}>{n}×</button>)}
          </div>
          <button className="ctl" onClick={() => { unlockSound(); setSoundOn(!sound) }} aria-pressed={sound}>Sound {sound ? 'on' : 'off'}</button>
          {extra}
        </div>
      </div>

      <div className="hq-center">
        <div className={`court ${ev && (ev.t === 'lost' || (ev.t === 'judge' && !ev.win)) ? `shake${cursor % 2}` : ''}`}>
          {sheet(foe)}
          <div className="net">
            <div className="net-off theirs">
              <span>{nm(foe)}</span>
              {offOf(foe) != null ? <Num value={offOf(foe)!} spd={spd} className="off-num" /> : <b className="off-num dim">–</b>}
              <small>{v.offKind[foe]}</small>
            </div>
            <div className="net-mid">
              <span className="sets"><b>{v.sets[me]}</b><i>Sets</i><b>{v.sets[foe]}</b></span>
            </div>
            <div className="net-off mine">
              <small>{v.offKind[me]}</small>
              {offOf(me) != null ? <Num value={offOf(me)!} spd={spd} className="off-num" /> : <b className="off-num dim">–</b>}
              <span>You</span>
            </div>
          </div>
          {sheet(me)}
          {ball ? <img key={cursor} className={`ball ${ball}`} src="/sim/hq-ball.svg" alt="" /> : null}
          {banner ? (
            <div key={cursor} className={`banner banner-${ev!.t} ${(ev!.t === 'victory' || ev!.t === 'interval') && ev!.p !== me ? 'lost' : ''} ${ev!.t === 'lost' && ev!.p === me ? 'lost' : ''}`}>
              <div>
                <strong>{banner.big}</strong>
                {banner.small ? <span>{banner.small}</span> : null}
              </div>
            </div>
          ) : null}
          {ev && ev.t === 'judge' ? (
            <div key={cursor} className={`judge ${ev.win ? 'won' : 'failed'} ${ev.p === me ? 'mine' : 'theirs'}`}>
              <span className="judge-kind">{/^Block/.test(ev.text) ? 'Block' : 'Receive'}</span>
              <div className="judge-nums">
                <span><i>Defense</i><b>{ev.n}</b></span>
                <em>vs</em>
                <span><i>Offense</i><b>{v.off[ev.p === me ? foe : me] ?? 0}</b></span>
              </div>
              <strong>{ev.win ? (/^Block/.test(ev.text) ? 'Blocked!' : 'Received!') : 'Point lost'}</strong>
            </div>
          ) : null}
          {ev && (ev.t === 'event' || ev.t === 'skill' || ev.t === 'reveal') && ev.uid != null ? (
            <div key={cursor} className={`flash-card ${ev.p === me ? 'mine' : 'theirs'}`}>
              <img src={img(m.s.cards[ev.uid], view)} alt="" />
              <span>{ev.t === 'event' ? 'Event' : ev.t === 'skill' ? 'Skill' : 'Reveal'}</span>
              <em>{nm(ev.p!)}</em>
            </div>
          ) : null}
          {mine && mine.kind === 'start' ? (() => {
            const off = v.off[foe] ?? 0
            const blockO = opts.find((o) => o.t === 'block')
            const recvO = opts.find((o) => o.t === 'receive')!
            return (
              <div className="start-pop" role="dialog" aria-label="Block or receive">
                <h3>Your turn</h3>
                <p className="sp-off">{nm(foe)}'s offense <b>{off}</b> <i>{v.offKind[foe]}</i></p>
                <div className="start-choices">
                  {blockO ? <button className={`btn ${blockO.i === hint ? 'hint' : ''}`} onClick={() => act(blockO.i)}><b>Block</b><span>Up to 3 characters, total Block Point {off} or more</span></button> : null}
                  <button className={`btn ${recvO.i === hint ? 'hint' : ''}`} onClick={() => act(recvO.i)}><b>Receive</b><span>Draw 1, Receive Point {off} or more, then set and attack</span></button>
                </div>
                {!blockO && (v.offKind[foe] === 'Serve' || v.offKind[foe] === 'Block')
                  ? <p className="sp-note">{v.offKind[foe] === 'Serve' ? 'A serve' : 'A ball sent back by a block'} can't be blocked. Receive it.</p>
                  : null}
                {tutor && hintOpt ? <p className="bp-tip">Suggested: {hqTipFor(hintOpt, nameOf)}</p> : null}
              </div>
            )
          })() : null}
        </div>
        <div className={`hand ${P0.hand.length > 9 ? 'packed' : P0.hand.length > 7 ? 'snug' : ''}`}>
          {P0.hand.map((u, i, all) => {
            const off = i - (all.length - 1) / 2
            return (
              <span key={u} className="hslot" data-uid={u} data-side={me}>
                <button
                  className={`hand-card ${cardOpts(u).length ? 'can' : ''} ${chosen === u ? 'sel' : ''} ${dragging === u ? 'lifted' : ''} ${hintOpt?.uid === u && chosen !== u ? 'hint' : ''}`}
                  style={{ '--rot': `${off * 2.2}deg`, '--dy': `${off * off * 1.4}px` } as React.CSSProperties}
                  onClick={() => pickCard(u)}
                  onMouseEnter={() => show(u)}
                  onPointerDown={(e) => { if (cardOpts(u).length && e.button === 0) drag.current = { uid: u, x0: e.clientX, y0: e.clientY, on: false } }}
                >
                  <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
                </button>
              </span>
            )
          })}
          {!P0.hand.length ? <span className="empty">Your hand is empty.</span> : null}
        </div>
      </div>

      <div className="prompt" aria-live="polite">
        <div className="who mine">
          <span className="who-name">You</span>
          {v.serveRight === me && v.phase !== 'over' && v.phase !== 'setup' ? <em>Serve right</em> : null}
          <span className="who-stat">Hand <b>{P0.hand.length}</b></span>
        </div>
        {over ? (
          <>
            <p className="result">{m.s.winner === me ? 'You win.' : 'You lose.'} <span>{m.s.reason}</span></p>
            <div className="choices">{after}</div>
          </>
        ) : playing ? (
          <>
            <p className="caption" key={cursor}>{ev!.text}</p>
            <div className="choices"><button className="ghost" onClick={skip}>Skip animation</button></div>
          </>
        ) : !mine ? (
          <p className="wait">{waitText}</p>
        ) : (
          <>
            <p>{problem ? <span className="problem">{problem} </span> : null}{gutsMany ? `Choose ${gutsNeed} Guts to pay (${marked.length} chosen).` : mine.text}{mine.kind === 'enter' ? <span className="hint"> Drag a card onto the sheet, or tap it.</span> : mine.kind === 'pick' && !tray.length && opts.some((o) => o.uid != null && onCourt(o.uid)) ? <span className="hint"> Tap a highlighted card on the sheet.</span> : null}</p>
            {tutor && hintOpt && mine.kind !== 'start' && mine.kind !== 'mulligan' ? (
              <p className="tip">Suggested: {hqTipFor(hintOpt, nameOf)} <button className="linkish" onClick={() => act(hint!)}>Do this for me</button></p>
            ) : null}
            {tray.length ? (
              <div className="tray">
                {tray.map((u) => (
                  <button key={u} className={`hand-card ${cardOpts(u).length ? 'can' : 'dim'} ${!gutsMany && chosen === u ? 'sel' : ''} ${gutsMany && marked.includes(u) ? 'marked' : ''} ${hintOpt?.uid === u && chosen !== u ? 'hint' : ''}`} onClick={() => pickCard(u)}>
                    <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
                    {gutsArea(u) ? <span className="tray-note">Guts: {gutsArea(u)}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            {gutsMany ? (
              <div className="choices">
                <button className="btn" disabled={marked.length !== gutsNeed} onClick={payMarked}>{marked.length === gutsNeed ? `Pay these ${gutsNeed} Guts` : `Choose ${gutsNeed - marked.length} more`}</button>
                {marked.length ? <button className="ghost" onClick={() => setMarked([])}>Clear</button> : null}
              </div>
            ) : null}
            <div className="choices" hidden={mine.kind === 'mulligan' || mine.kind === 'start' || gutsMany}>
              {chosen != null ? <span className="chosen">{nameOf(chosen)}</span> : null}
              {chosenOpts.map((o) => <button key={o.i} className={`btn ${o.i === hint ? 'hint' : ''}`} onClick={() => act(o.i)}>{shortLabel(o)}</button>)}
              {chosen != null ? <button className="ghost view" onClick={() => setZoom(true)}>View card</button> : null}
              {plain.map((o) => <button key={o.i} className={`${o.t === 'yes' || o.t === 'keep' || o.t === 'param' || o.t === 'name' || o.t === 'opt' || o.t === 'serve' || o.t === 'order' ? 'btn' : 'ghost'} ${o.i === hint ? 'hint' : ''}`} onClick={() => act(o.i)}>{o.label}</button>)}
            </div>
            {bigOpt || (lostOpt && mine.kind !== 'start') ? (
              <div className="prompt-end">
                {bigOpt ? <button className={`endbtn ${bigOpt.i === hint ? 'hint' : ''}`} onClick={() => act(bigOpt.i)}>{bigOpt.label}</button> : null}
                {lostOpt && mine.kind !== 'start' ? <button className={`ghost lostbtn ${sure ? 'sure' : ''}`} onClick={lostSure}>{sure ? 'Tap again to declare Lost' : 'Declare Lost'}</button> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <aside className="side">
        <div className="peek">
          {lookDef ? (
            <>
              <img src={img(lookDef.id, view, true)} alt={lookDef.name} />
              <h3>{lookDef.name}</h3>
              <p className="peek-facts">{lookDef.type} · {lookDef.aff}{lookDef.pos.length ? ` · ${lookDef.pos.join(', ')}` : ''}</p>
              {lookDef.type === 'Character' ? (
                <p className="peek-stats">
                  {(['sv', 'bl', 'rc', 'st', 'at'] as Param[]).map((k) => <span key={k}><i>{PNAME[k]}</i><b>{lookDef[k] ?? '–'}</b></span>)}
                </p>
              ) : null}
              {lookDef.text ? <p className="peek-text">{lookDef.text}</p> : null}
            </>
          ) : (
            <p className="peek-empty">Click a card to read it here.</p>
          )}
        </div>
        <h3 className="log-title">Match log</h3>
        <ol className="log" ref={logRef}>
          {sets.map((r) => (
            <li key={r.round}>
              {r.round ? <b>Set {r.round}</b> : <b>Setup</b>}
              {r.lines.filter((t) => !/^Set \d+\./.test(t)).map((t, i) => <span key={i} className={/Phase\.$/.test(t) ? 'log-phase' : ''}>{t}</span>)}
            </li>
          ))}
        </ol>
      </aside>

      {lesson && lesson.key !== 'welcome' ? (
        <aside className={`coach ${lesson.pause ? 'paused' : ''}`} role="dialog" aria-live="polite" aria-label={lesson.title}>
          <span className="coach-kicker">Tutorial</span>
          <h3>{lesson.title}</h3>
          {lesson.body.map((t, i) => <p key={i}>{t}</p>)}
          {lesson.pause
            ? <button className="btn" onClick={() => tutor!.onSeen(lesson.key)}>Continue</button>
            : <button className="ghost" onClick={() => tutor!.onSeen(lesson.key)}>Got it</button>}
        </aside>
      ) : null}
      <img ref={ghostRef} className="drag-ghost" hidden={dragging == null} src={dragging != null ? img(m.s.cards[dragging], view) : undefined} alt="" />
      {intro ? (
        <div className="versus" onClick={() => setIntro(false)}>
          <div className="vs-side theirs"><span>{nm(foe)}</span></div>
          <b>VS</b>
          <div className="vs-side mine"><span>{nm(me)}</span></div>
          <small>Tap to skip</small>
        </div>
      ) : null}
      {!intro && mine && mine.kind === 'mulligan' ? (
        <div className="shade opening-shade">
          <div className="opening">
            <h2>{lesson?.key === 'welcome' ? lesson.title : 'Your opening hand'}</h2>
            {lesson?.key === 'welcome'
              ? lesson.body.map((t, i) => <p key={i}>{t}</p>)
              : <p>{v.serveRight === me ? 'You have the first serve.' : `${nm(foe)} has the first serve.`} Keep these 6 cards, or tap the ones you want to put back and draw replacements. You can do this once.</p>}
            <div className="opening-cards">
              {P0.hand.map((u, i) => (
                <div className="slot" key={u}>
                  <button className={`mark ${marked.includes(u) ? 'back' : ''}`} aria-pressed={marked.includes(u)} style={{ animationDelay: `${i * 110}ms` }}
                    onClick={() => { if (tutor) { show(u); setZoom(true) } else { play('click'); toggle(u, 6) } }}>
                    <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
                  </button>
                  {tutor ? null : <button className="read" onClick={() => { show(u); setZoom(true) }}>Read</button>}
                </div>
              ))}
            </div>
            <div className="opening-actions">
              {marked.length && !tutor ? (
                <>
                  <button className="btn" onClick={putBack}>Put back {marked.length} and draw {marked.length}</button>
                  <button className="ghost" onClick={() => setMarked([])}>Clear</button>
                </>
              ) : opts.filter((o) => (tutor ? o.t === 'keep' : o.t !== 'pick')).map((o) => <button key={o.i} className={`${o.t === 'keep' ? 'btn' : 'ghost'} ${tutor && o.i === hint ? 'hint' : ''}`} onClick={() => act(o.i)}>{o.label}</button>)}
            </div>
            <small>{tutor ? 'Tap a card to read it.' : 'Tap a card to mark it for putting back.'}</small>
          </div>
        </div>
      ) : null}
      {over && resultOpen ? (
        <div className={`shade result-shade ${m.s.winner === me ? 'won' : 'lost'}`} onClick={() => setResultOpen(false)}>
          <div className="result-pop" onClick={(e) => e.stopPropagation()}>
            <i className="rays" />
            <h2>{m.s.winner === me ? 'Victory' : 'Defeat'}</h2>
            <p>{m.s.reason}</p>
            {tutor ? <p className="result-note">That is the whole game. Try the other school, build your own deck in the deck builder, or play a friend with a room code.</p> : null}
            <dl>
              <div><dt>Sets</dt><dd>{v.sets[me]} – {v.sets[foe]}</dd></div>
              <div><dt>Turns</dt><dd>{v.turnNo}</dd></div>
            </dl>
            <div className="opening-actions">
              {after}
              <button className="ghost" onClick={() => setResultOpen(false)}>View the court</button>
            </div>
          </div>
        </div>
      ) : null}
      {zoom && lookDef ? (
        <div className="shade" onClick={() => setZoom(false)}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            <img src={img(lookDef.id, view, true)} alt={lookDef.name} />
            <div>
              <h3>{lookDef.name}</h3>
              {lookDef.type === 'Character' ? <p className="peek-stats">{(['sv', 'bl', 'rc', 'st', 'at'] as Param[]).map((k) => <span key={k}><i>{PNAME[k]}</i><b>{lookDef[k] ?? '–'}</b></span>)}</p> : null}
              {lookDef.text ? <p className="peek-text">{lookDef.text}</p> : null}
              <button className="ghost" onClick={() => setZoom(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {pile ? (
        <div className="shade" onClick={() => setPile(null)}>
          <div className="pile" onClick={(e) => e.stopPropagation()}>
            <h3>{pile.title} <button className="ghost" onClick={() => setPile(null)}>Close</button></h3>
            <div className="pile-cards">
              {pile.uids.map((u) => <img key={u} src={img(m.s.cards[u], view)} alt={m.name(u)} title={m.name(u)} onClick={() => { show(u); setPile(null); setZoom(true) }} />)}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

/** Options sit under the chosen card's name, so they can be short. */
function shortLabel(o: Opt) {
  if (o.t === 'card') return 'Choose'
  return o.label
}
