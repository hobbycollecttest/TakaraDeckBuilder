// Haikyu!! VOBACA!! BREAK simulator: lobby and table. The rules live in src/sim/hq.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AREA_PARAM, DEFS, HQ, PHASE_LABEL, PNAME, type Area, type Ev, type Opt, type Param, type Setup, type Side, type View as HView } from '../../sim/hq/engine'
import { cpuChoice, type Level } from '../../sim/hq/ai'
import { HQ_PRACTICE, expandHQ } from '../../sim/hq/decks'
import { play, setSound, unlockSound } from '../sound'
import { useGlide } from '../motion'
import { authReady, currentAccount } from '../../auth'
import { listDecks, type CloudDeck } from '../../cloud'
import { store, type View } from '../../game'

type Save = { v: number; setup: Setup; answers: number[]; level: Level }
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
  useEffect(() => store.set('haikyu.view', view), [view])

  const start = (ids: string[], cpuIds: string[], level: Level) => {
    const next: Save = { v: SAVE_VERSION, setup: { seed: Math.floor(Math.random() * 2 ** 31), decks: [ids, cpuIds], names: ['You', 'CPU'] }, answers: [], level }
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
    <div className={`app play hq ${playing && save ? 'in-match' : ''}`} onPointerDown={unlockSound}>
      <header className="top">
        <a className="brand" href="/haikyu">
          <span className="brand-game">Haikyu!! VOBACA!! BREAK</span>
          <span className="brand-tool">Play</span>
        </a>
        <div className="seg" role="group" aria-label="Card language">
          <button className={view === 'en' ? 'on' : ''} onClick={() => setView('en')}>English</button>
          <button className={view === 'jp' ? 'on' : ''} onClick={() => setView('jp')}>日本語</button>
        </div>
        {playing ? <button className="signin" onClick={() => setPlaying(false)}>Menu</button> : <a className="signin" href="/haikyu">Deck builder</a>}
      </header>
      {playing && save ? (
        <LocalTable key={matchId} save={save} view={view} onAgain={() => start(save.setup.decks[0], save.setup.decks[1], save.level)} onMenu={drop} />
      ) : (
        <Lobby save={save} view={view} onResume={() => setPlaying(true)} onStart={start} />
      )}
    </div>
  )
}

function Lobby({ save, view, onResume, onStart }: { save: Save | null; view: View; onResume: () => void; onStart: (ids: string[], cpuIds: string[], level: Level) => void }) {
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
  const canResume = useMemo(() => {
    if (!save) return false
    try { return HQ.replay(save.setup, save.answers).s.phase !== 'over' } catch { return false }
  }, [save])
  const go = () => {
    const cpu = theirs === 'random' ? HQ_PRACTICE[Math.floor(Math.random() * HQ_PRACTICE.length)] : HQ_PRACTICE.find((p) => p.team === theirs)!
    onStart(picked.ids, cpu.ids, level)
  }
  return (
    <main className="lobby">
      <h1>Play Haikyu!! VOBACA!! BREAK</h1>
      <p className="lede">A full match with the official rules, right in your browser: serve, block or receive, set, attack, and fight for every set until someone runs out of Score cards.</p>
      {canResume ? (
        <div className="resume">
          <span>You have a match in progress.</span>
          <button className="btn" onClick={onResume}>Resume match</button>
        </div>
      ) : null}
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
            <span>CPU school</span>
            <select className="pick" value={theirs} onChange={(e) => setTheirs(e.target.value)}>
              <option value="random">Random</option>
              {HQ_PRACTICE.map((p) => <option key={p.team} value={p.team}>{p.team}</option>)}
            </select>
          </div>
          <div className="field-row">
            <span>Difficulty</span>
            <div className="seg small">
              <button className={level === 'easy' ? 'on' : ''} onClick={() => setLevel('easy')}>Easy</button>
              <button className={level === 'normal' ? 'on' : ''} onClick={() => setLevel('normal')}>Normal</button>
            </div>
          </div>
          <button className="btn start" onClick={go} disabled={!!picked.error}>Start match</button>
          <p className="fine">The CPU follows the same rules you do. It decides from its own hand and the cards on the court, and never looks at your hand or either deck.</p>
          <p className="fine">New to the game? The <a href="/haikyu/rules">rules page</a> explains a rally in a few minutes.</p>
          <p className="fine">Playing a friend with a room code is coming next.</p>
        </section>
      </div>
    </main>
  )
}

/** A match against the computer. It lives entirely in this browser. */
function LocalTable({ save, view, onAgain, onMenu }: { save: Save; view: View; onAgain: () => void; onMenu: () => void }) {
  const ref = useRef<HQ | null>(null)
  if (!ref.current) {
    ref.current = HQ.replay(save.setup, save.answers)
    ref.current.record = true
  }
  const m = ref.current
  const send = (i: number) => {
    m.answer(i)
    store.set(SAVE_KEY, { ...save, answers: m.answers })
  }
  return (
    <Table m={m} me={0} view={view} onAct={send} cpu={save.level} waitText="The computer is thinking…"
      after={<><button className="btn" onClick={onAgain}>Play again</button><button className="ghost" onClick={onMenu}>Change decks</button></>} />
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
const SLOTS: { area: Area; label: string }[] = [
  { area: 'serve', label: 'Serve' }, { area: 'center', label: 'Block' }, { area: 'receive', label: 'Receive' }, { area: 'set', label: 'Set' }, { area: 'attack', label: 'Attack' },
]
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

function Table({ m, me, view, onAct, cpu, waitText, after }: {
  m: HQ; me: Side; view: View; onAct: (i: number) => void | Promise<void>; cpu?: Level; waitText: string; after: React.ReactNode
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
  const v = useMemo(() => (ev ? ev.view : m.snapshot()), [ev, tick])
  const req = m.req
  const mine = !playing && req && req.p === me ? req : null
  const over = !playing && m.s.phase === 'over'

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
    unlockSound()
    setProblem('')
    setBusy(true)
    try { await onAct(i) } catch (e) { setProblem(e instanceof Error ? e.message : 'That did not go through. Please try again.') }
    setBusy(false)
    setSel(null)
    setTick((n) => n + 1)
  }
  const skip = () => setCursor(m.events.length)

  // Step through what just happened, with a sound for each event.
  useEffect(() => {
    if (!ev || intro) return
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
  }, [cursor, ev, speed, intro])
  // Once the table has caught up, the computer makes its next choice.
  useEffect(() => {
    if (playing || intro || !cpu || !m.req || m.req.p !== foe) return
    const t = setTimeout(() => act(cpuChoice(m, cpu)), 480 / spd)
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
  const onCourt = (u: number) => [0, 1].some((s) => SLOTS.some(({ area }) => v.ps[s][area].includes(u)) || v.ps[s].sides.includes(u))
  // Cards to choose from that are not in your hand or on the court are laid out in a tray.
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
  const pickCard = (uid: number) => {
    if (justDragged.current) return
    unlockSound()
    play('click')
    show(uid)
    setSel(cardOpts(uid).length ? uid : null)
  }
  const nm = (side: Side) => m.nm(side)
  const lookDef = look ? DEFS.get(look)! : null
  const nameOf = (u: number) => v.alias[u] || m.def(u).name
  // The area the current choice is about, so it can light up.
  const askArea = mine && mine.kind === 'enter' ? opts.find((o) => o.area)?.area : undefined

  /** One Area on the court: the top character, its number for this Area, and its Guts. */
  const slot = (side: Side, area: Area, label: string) => {
    const P = v.ps[side]
    const list = P[area]
    const top = list.length ? list[list.length - 1] : null
    const k = AREA_PARAM[area]
    const n = top != null ? v.pv[top]?.[k] ?? null : null
    const live = v.turn === side && ((area === 'serve' && v.phase === 'serve') || (area === 'center' && v.phase === 'block') || (area === 'receive' && v.phase === 'receive') || (area === 'set' && v.phase === 'set') || (area === 'attack' && v.phase === 'attack'))
    const target = side === me && askArea && (askArea === area || (area === 'center' && askArea === 'sides'))
    const fx = ev && ev.t === 'enter' && ev.uid != null && list.includes(ev.uid) ? 'fx-enter' : ev && (ev.t === 'pump' || ev.t === 'cut') && ev.uid === top ? `fx-${ev.t}` : ''
    const pick = top != null ? opts.find((o) => o.uid === top && o.t === 'card') : undefined
    const sides = area === 'center' ? P.sides : []
    return (
      <div key={area} className={`court-slot a-${area} ${live ? 'live' : ''} ${target ? 'target' : ''} ${pick ? 'pickable' : ''} ${fx}`} data-drop={side === me ? area : undefined}
        onClick={() => (pick ? act(pick.i) : top != null ? peek(top) : undefined)} role={pick || top != null ? 'button' : undefined}>
        <span className="slot-label">{label}</span>
        <div className="slot-cards">
          {top != null ? (
            <span key={top} className="cardwrap" data-uid={top} data-side={side} onMouseEnter={() => show(top)}>
              <img className="card" src={img(m.s.cards[top], view)} alt={nameOf(top)} draggable={false} />
              {v.alias[top] ? <span className="alias">{v.alias[top]}</span> : null}
            </span>
          ) : <span className="slot-empty" />}
          {sides.map((u, i) => {
            const sp = opts.find((o) => o.uid === u && o.t === 'card')
            return (
              <span key={u} className={`side-blocker s${i} ${sp ? 'pickable' : ''}`} data-uid={u} data-side={side}
                onClick={(e) => { e.stopPropagation(); if (sp) void act(sp.i); else peek(u) }} onMouseEnter={() => show(u)}>
                <img src={img(m.s.cards[u], view)} alt={nameOf(u)} draggable={false} />
                <b className="mini-num">{v.pv[u]?.bl ?? 0}</b>
              </span>
            )
          })}
        </div>
        {top != null && n != null ? <span className="param"><i>{P_SHORT[k]}</i><Num value={area === 'center' ? n + sides.reduce((a, u) => a + (v.pv[u]?.bl ?? 0), 0) : n} spd={spd} /></span> : null}
        {list.length > 1 ? <span className="guts" title="Guts: cards under the character, paid as costs">{list.length - 1} Guts</span> : null}
        {fx === 'fx-enter' ? <i className="ring" /> : null}
        {(fx === 'fx-pump' || fx === 'fx-cut') && ev ? <b className={`float ${fx === 'fx-pump' ? 'gain' : 'hit'}`}>{ev.text.match(/[+−-]\d+ \w+/)?.[0]?.replace(/ (\w+)$/, (_m, w: string) => ` ${w}`) ?? ''}</b> : null}
      </div>
    )
  }

  const half = (side: Side) => {
    const P = v.ps[side]
    const dropTop = P.drop[P.drop.length - 1]
    const evFx = ev && ev.p === side && (ev.t === 'event' || ev.t === 'skill') ? 'fx-event' : ''
    const evTarget = side === me && chosenOpts.some((o) => o.t === 'event' || o.t === 'hand')
    return (
      <section className={`court-half ${side === me ? 'mine' : 'theirs'} ${v.turn === side && v.phase !== 'end' ? 'active' : ''}`}>
        <div key={ev && ev.t === 'score' && ev.p === side ? `sc${cursor}` : 'sc'} className={`zone-score ${ev && ev.t === 'score' && ev.p === side ? 'fx-score' : ''}`}>
          <span className="zlabel">Score <b>{P.score.length}</b></span>
          <div className="score-stack">
            {P.score.map((u) => <i key={u} className="cb" data-uid={u} data-side={side} title="Score card" />)}
            {!P.score.length ? <span className="no-score">Last set</span> : null}
          </div>
        </div>
        <div className="areas">
          {SLOTS.map(({ area, label }) => slot(side, area, label))}
        </div>
        <div key={evFx ? `ev${cursor}` : 'ev'} className={`zone-events ${evFx} ${evTarget ? 'target-zone' : ''}`} data-drop={side === me ? 'event' : undefined}
          onClick={() => { const o = evTarget ? chosenOpts.find((x) => x.t === 'event' || x.t === 'hand') : undefined; if (o) void act(o.i) }}>
          <span className="zlabel">Events <b>{P.event.length}</b></span>
          <div className="event-cards">
            {P.event.map((u) => (
              <span key={u} className="eslot" data-uid={u} data-side={side}>
                <img src={img(m.s.cards[u], view)} alt={m.name(u)} title={m.name(u)} draggable={false} onMouseEnter={() => show(u)} onClick={(c) => { c.stopPropagation(); peek(u) }} />
              </span>
            ))}
          </div>
        </div>
        <div className="zone-piles">
          <div key={ev && ev.t === 'draw' && ev.p === side ? `d${cursor}` : 'd'} className={`pile-slot ${ev && ev.t === 'draw' && ev.p === side ? 'fx-draw' : ''}`} title="Deck">
            {P.deck.length ? <i className="cb" data-deck={side} /> : <i className="cb none" data-deck={side} />}
            <span className="zlabel">Deck <b>{P.deck.length}</b></span>
          </div>
          <button className="pile-slot" disabled={!P.drop.length} onClick={() => setPile({ title: `${nm(side)}: Drop Area`, uids: [...P.drop].reverse() })}>
            {dropTop != null ? <img data-uid={dropTop} data-side={side} src={img(m.s.cards[dropTop], view)} alt="" draggable={false} /> : <i className="cb none" />}
            <span className="zlabel">Drop <b>{P.drop.length}</b></span>
          </button>
        </div>
      </section>
    )
  }

  const offOf = (side: Side) => v.off[side]
  const plate = (side: Side, tail?: React.ReactNode) => (
    <div className={`plate ${side === me ? 'mine' : 'theirs'}`}>
      <span className="who-name">{nm(side)}</span>
      {v.serveRight === side && v.phase !== 'over' ? <em>Serve right</em> : null}
      <span className="plate-stat">Hand <b>{v.ps[side].hand.length}</b></span>
      {tail}
    </div>
  )

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
      <div className="board">
        <div className="cpu-row">
          {plate(foe)}
          <div className="cpu-hand" aria-label={`${nm(foe)}'s hand: ${v.ps[foe].hand.length} cards`}>
            {v.ps[foe].hand.map((u) => <i key={u} className="cb" data-uid={u} data-side={foe} />)}
          </div>
          <div className="controls">
            <div className="seg" role="group" aria-label="Animation speed">
              {[1, 2, 3].map((n) => <button key={n} className={speed === n ? 'on' : ''} onClick={() => setSpeed(n)}>{n}×</button>)}
            </div>
            <button className="ctl" onClick={() => { unlockSound(); setSoundOn(!sound) }} aria-pressed={sound}>Sound {sound ? 'on' : 'off'}</button>
          </div>
        </div>
        <div className="phasebar" aria-live="polite">
          <span className="phase-round">Set <b>{Math.max(v.setNo, 1)}</b></span>
          <ol>
            {PHASES.map(([key, label]) => <li key={key} className={v.phase === key ? 'on' : ''}>{label}</li>)}
          </ol>
          <span className="phase-step">{step}</span>
        </div>
        <div className={`court ${ev && (ev.t === 'lost' || (ev.t === 'judge' && !ev.win)) ? `shake${cursor % 2}` : ''}`}>
          {half(foe)}
          <div className="net">
            <div className={`net-off theirs ${v.turn !== me && offOf(foe) != null ? '' : ''}`}>
              <span>{nm(foe)} offense</span>
              {offOf(foe) != null ? <Num value={offOf(foe)!} spd={spd} className="off-num" /> : <b className="off-num dim">–</b>}
              <small>{v.offKind[foe]}</small>
            </div>
            <div className="net-mid">
              <span className="sets"><b>{v.sets[me]}</b><i>Sets</i><b>{v.sets[foe]}</b></span>
              {v.def != null ? <span className="def-now">Defense <b>{v.def}</b></span> : null}
            </div>
            <div className="net-off mine">
              <span>Your offense</span>
              {offOf(me) != null ? <Num value={offOf(me)!} spd={spd} className="off-num" /> : <b className="off-num dim">–</b>}
              <small>{v.offKind[me]}</small>
            </div>
          </div>
          {half(me)}
          {ball ? <i key={cursor} className={`ball ${ball}`} /> : null}
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
              <div className="battle-pop start-pop" role="dialog" aria-label="Block or receive">
                <h3>Your turn</h3>
                <p className="bp-score"><span>{nm(foe)}'s offense <b>{off}</b></span><i>{v.offKind[foe]}</i></p>
                <p className="bp-state">Block it with up to three characters, or let it through and receive it with one.</p>
                <div className="start-choices">
                  {blockO ? <button className="btn" onClick={() => act(blockO.i)}><b>Block</b><span>Total Block Point ≥ {off}</span></button> : null}
                  <button className="btn" onClick={() => act(recvO.i)}><b>Receive</b><span>Draw 1, Receive Point ≥ {off}, then set and attack</span></button>
                </div>
              </div>
            )
          })() : null}
        </div>
        {plate(me, <>
          {lostOpt && mine && mine.kind !== 'start' ? <button className={`ghost lostbtn ${sure ? 'sure' : ''}`} onClick={lostSure}>{sure ? 'Tap again to declare Lost' : 'Declare Lost'}</button> : null}
          {bigOpt ? <button className="endbtn" onClick={() => act(bigOpt.i)}>{bigOpt.label}</button> : null}
        </>)}
        <div className={`hand ${P0.hand.length > 9 ? 'packed' : P0.hand.length > 7 ? 'snug' : ''}`}>
          {P0.hand.map((u, i, all) => {
            const off = i - (all.length - 1) / 2
            return (
              <span key={u} className="hslot" data-uid={u} data-side={me}>
                <button
                  className={`hand-card ${cardOpts(u).length ? 'can' : ''} ${chosen === u ? 'sel' : ''} ${dragging === u ? 'lifted' : ''}`}
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
        <div className="prompt" aria-live="polite">
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
              <p>{problem ? <span className="problem">{problem} </span> : null}{mine.text}{mine.kind === 'enter' ? <span className="hint"> Drag a card onto the area, or tap it.</span> : mine.kind === 'pick' && !tray.length && opts.some((o) => o.uid != null && onCourt(o.uid)) ? <span className="hint"> Tap a highlighted card on the court.</span> : null}</p>
              {tray.length ? (
                <div className="tray">
                  {tray.map((u) => (
                    <button key={u} className={`hand-card ${cardOpts(u).length ? 'can' : 'dim'} ${chosen === u ? 'sel' : ''}`} onClick={() => pickCard(u)}>
                      <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="choices" hidden={mine.kind === 'mulligan' || mine.kind === 'start'}>
                {chosen != null ? <span className="chosen">{nameOf(chosen)}</span> : null}
                {chosenOpts.map((o) => <button key={o.i} className="btn" onClick={() => act(o.i)}>{shortLabel(o)}</button>)}
                {chosen != null ? <button className="ghost view" onClick={() => setZoom(true)}>View card</button> : null}
                {plain.map((o) => <button key={o.i} className={o.t === 'yes' || o.t === 'keep' || o.t === 'param' || o.t === 'name' || o.t === 'opt' ? 'btn' : 'ghost'} onClick={() => act(o.i)}>{o.label}</button>)}
              </div>
            </>
          )}
        </div>
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
            <h2>Your opening hand</h2>
            <p>{v.serveRight === me ? 'You have the first serve.' : `${nm(foe)} has the first serve.`} Keep these 6 cards, or redraw all of them once.</p>
            <div className="opening-cards">
              {P0.hand.map((u, i) => (
                <button key={u} style={{ animationDelay: `${i * 110}ms` }} onClick={() => { show(u); setZoom(true) }}>
                  <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
                </button>
              ))}
            </div>
            <div className="opening-actions">
              {opts.map((o) => <button key={o.i} className={o.t === 'keep' ? 'btn' : 'ghost'} onClick={() => act(o.i)}>{o.t === 'keep' ? 'Keep hand' : 'Redraw'}</button>)}
            </div>
            <small>Tap a card to read it.</small>
          </div>
        </div>
      ) : null}
      {over && resultOpen ? (
        <div className={`shade result-shade ${m.s.winner === me ? 'won' : 'lost'}`} onClick={() => setResultOpen(false)}>
          <div className="result-pop" onClick={(e) => e.stopPropagation()}>
            <i className="rays" />
            <h2>{m.s.winner === me ? 'Victory' : 'Defeat'}</h2>
            <p>{m.s.reason}</p>
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
