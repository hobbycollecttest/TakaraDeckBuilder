import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFS, Match, type Ev, type Opt, type Setup, type Side } from '../sim/engine'
import { play, setSound, unlockSound } from './sound'
import { cpuChoice, type Level } from '../sim/ai'
import { PRACTICE, expandDeck } from '../sim/decks'
import { store, type Deck, type View } from '../game'

// The match in progress is kept in the browser as its setup plus the list of choices
// made so far. Nothing is sent to a server.
type Save = { v: number; setup: Setup; answers: number[]; level: Level }
const SAVE_VERSION = 1
const SAVE_KEY = 'hb.play'
const ME: Side = 0
const CPU: Side = 1

const img = (id: string, view: View, large = false) => {
  const v = DEFS.get(id)?.v
  return `/cards/horobeat/${view}${large ? '-lg' : ''}/${id}.webp${v && view === 'en' ? `?v=${v}` : ''}`
}

type Choice = { key: string; label: string; note: string; ids: string[]; error: string }

function deckChoices(): Choice[] {
  const out: Choice[] = []
  const add = (key: string, label: string, deck: Deck) => {
    const { ids, error } = expandDeck(deck)
    if (!ids.length) return
    out.push({ key, label, note: error ? `${ids.length}/50 cards` : '', ids, error })
  }
  // A deck shared by link opens straight into the simulator.
  const d = new URLSearchParams(location.hash.slice(1)).get('d')
  if (d) {
    const deck: Deck = {}
    for (const part of d.split('~')) {
      const [id, n] = part.split('.')
      if (DEFS.has(id) && Number(n) > 0) deck[id] = Math.min(Number(n), 4)
    }
    add('link', new URLSearchParams(location.hash.slice(1)).get('n') || 'Shared deck', deck)
  }
  add('current', store.get('hb.name', '') || 'Deck in the builder', store.get<Deck>('hb.deck', {}))
  for (const s of store.get<{ id: string; name: string; deck: Deck }[]>('hb.saved', [])) add(`saved:${s.id}`, s.name || 'Untitled deck', s.deck)
  for (const p of PRACTICE) out.push({ key: `practice:${p.color}`, label: p.name, note: '', ids: p.ids, error: '' })
  return out
}

export default function Play() {
  const [save, setSave] = useState<Save | null>(() => {
    const s = store.get<Save | null>(SAVE_KEY, null)
    return s && s.v === SAVE_VERSION ? s : null
  })
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<View>(() => store.get<View>('hb.view', 'en'))
  const [matchId, setMatchId] = useState(0)
  useEffect(() => store.set('hb.view', view), [view])

  const start = (ids: string[], cpuIds: string[], level: Level) => {
    const next: Save = { v: SAVE_VERSION, setup: { seed: Math.floor(Math.random() * 2 ** 31), decks: [ids, cpuIds], names: ['You', 'CPU'] }, answers: [], level }
    store.set(SAVE_KEY, next)
    setSave(next)
    setMatchId((n) => n + 1)
    setPlaying(true)
  }
  const leave = () => setPlaying(false)
  const drop = () => {
    store.set(SAVE_KEY, null)
    setSave(null)
    setPlaying(false)
  }

  return (
    <div className={`app play ${playing && save ? 'in-match' : ''}`} onPointerDown={unlockSound}>
      <header className="top">
        <a className="brand" href="/">
          <span className="brand-game">HORO-BEAT</span>
          <span className="brand-tool">Play vs CPU</span>
        </a>
        <div className="seg" role="group" aria-label="Card language">
          <button className={view === 'en' ? 'on' : ''} onClick={() => setView('en')}>English</button>
          <button className={view === 'jp' ? 'on' : ''} onClick={() => setView('jp')}>日本語</button>
        </div>
        {playing ? <button className="signin" onClick={leave}>Menu</button> : <a className="signin" href="/">Deck builder</a>}
      </header>
      {playing && save ? (
        <Table key={matchId} save={save} view={view} onAgain={() => start(save.setup.decks[0], save.setup.decks[1], save.level)} onMenu={drop} />
      ) : (
        <Lobby save={save} view={view} onResume={() => setPlaying(true)} onStart={start} />
      )}
    </div>
  )
}

function Lobby({ save, view, onResume, onStart }: { save: Save | null; view: View; onResume: () => void; onStart: (ids: string[], cpuIds: string[], level: Level) => void }) {
  const choices = useMemo(deckChoices, [])
  const [mine, setMine] = useState(() => (choices.find((c) => !c.error) || choices[0]).key)
  const [theirs, setTheirs] = useState('random')
  const [level, setLevel] = useState<Level>('normal')
  const picked = choices.find((c) => c.key === mine)!
  const canResume = useMemo(() => {
    if (!save) return false
    try {
      return Match.replay(save.setup, save.answers).s.phase !== 'over'
    } catch {
      return false
    }
  }, [save])
  const face = (ids: string[]) => {
    const count = new Map<string, number>()
    ids.forEach((id) => count.set(id, (count.get(id) || 0) + 1))
    return [...count.keys()].sort((a, b) => DEFS.get(b)!.cost - DEFS.get(a)!.cost)[0]
  }
  const go = () => {
    const cpu = theirs === 'random' ? PRACTICE[Math.floor(Math.random() * PRACTICE.length)] : PRACTICE.find((p) => p.color === theirs)!
    onStart(picked.ids, cpu.ids, level)
  }

  return (
    <main className="lobby">
      <h1>Play HORO-BEAT against the computer</h1>
      <p className="lede">A full match with the official rules, right in your browser. Your game is saved on this device, so you can close the page and pick it up later.</p>
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
                  <span className="deck-pick-note">{c.note || deckColors(c.ids)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="fine">Decks you make in the <a href="/">deck builder</a> on this device show up here once they have 50 cards.</p>
        </section>
        <section>
          <h2>Opponent</h2>
          <div className="field-row">
            <span>CPU deck</span>
            <div className="seg small">
              {['random', 'Red', 'Green', 'Blue'].map((k) => (
                <button key={k} className={theirs === k ? 'on' : ''} onClick={() => setTheirs(k)}>{k === 'random' ? 'Random' : k}</button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <span>Difficulty</span>
            <div className="seg small">
              <button className={level === 'easy' ? 'on' : ''} onClick={() => setLevel('easy')}>Easy</button>
              <button className={level === 'normal' ? 'on' : ''} onClick={() => setLevel('normal')}>Normal</button>
            </div>
          </div>
          <button className="btn start" onClick={go} disabled={!!picked.error}>Start match</button>
          <p className="fine">The CPU follows the same rules you do. It decides from its own hand and the cards on the table, and never looks at your hand or either deck.</p>
          <p className="fine">New to the game? Read <a href="/how-to-play">How to play</a> first. It takes about five minutes.</p>
        </section>
      </div>
    </main>
  )
}

function deckColors(ids: string[]) {
  const n = new Map<string, number>()
  ids.forEach((id) => n.set(DEFS.get(id)!.color, (n.get(DEFS.get(id)!.color) || 0) + 1))
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).join(' / ')
}

// How long each kind of event stays on screen at normal speed, in milliseconds.
const PACE: Record<string, number> = {
  round: 1250, phase: 900, line: 700, first: 900, draw: 380, charge: 520, summon: 720, waza: 780, clash: 1300,
  down: 520, destroy: 700, damage: 760, trigger: 1500, recover: 420, ena: 420, refresh: 420, victory: 2200, note: 520,
}
const SOUND: Record<string, string> = {
  round: 'drum', phase: 'drum', line: 'line', first: 'drum', draw: 'draw', charge: 'charge', summon: 'summon', waza: 'waza', clash: 'clash',
  down: 'down', destroy: 'destroy', damage: 'damage', trigger: 'trigger', recover: 'recover', ena: 'charge', refresh: 'draw',
}
const PHASES: [View2['phase'], string][] = [['summon', 'Summon'], ['battle', 'Battle'], ['end', 'End']]
type View2 = ReturnType<Match['snapshot']>

function Table({ save, view, onAgain, onMenu }: { save: Save; view: View; onAgain: () => void; onMenu: () => void }) {
  const ref = useRef<Match | null>(null)
  if (!ref.current) {
    ref.current = Match.replay(save.setup, save.answers)
    ref.current.record = true
  }
  const m = ref.current
  const [tick, setTick] = useState(0)
  // Events are played back one at a time. `cursor` is how many have been shown.
  const [cursor, setCursor] = useState(0)
  const [speed, setSpeed] = useState(() => store.get('hb.speed', 1))
  const [sound, setSoundOn] = useState(() => store.get('hb.sound', true))
  const [sel, setSel] = useState<number | null>(null)
  const [look, setLook] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const [pile, setPile] = useState<{ title: string; uids: number[] } | null>(null)
  const logRef = useRef<HTMLOListElement>(null)

  const ev: Ev | null = cursor < m.events.length ? m.events[cursor] : null
  const playing = !!ev
  const v = useMemo(() => (ev ? ev.view : m.snapshot()), [ev, tick])
  const req = m.req
  const mine = !playing && req && req.p === ME ? req : null
  const over = !playing && m.s.phase === 'over'

  useEffect(() => { store.set('hb.speed', speed) }, [speed])
  useEffect(() => { store.set('hb.sound', sound); setSound(sound) }, [sound])

  const act = (i: number) => {
    unlockSound()
    m.answer(i)
    store.set(SAVE_KEY, { ...save, answers: m.answers })
    setSel(null)
    setTick((n) => n + 1)
  }
  const skip = () => setCursor(m.events.length)

  // Step through what just happened, with a sound for each event.
  useEffect(() => {
    if (!ev) return
    const sfx = ev.t === 'damage' && ev.broken ? 'heartbreak' : ev.t === 'victory' ? (ev.p === ME ? 'win' : 'lose') : SOUND[ev.t]
    if (sfx) play(sfx)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const base = (PACE[ev.t] ?? PACE.note) + (ev.t === 'damage' && ev.broken ? 300 : 0)
    const t = setTimeout(() => setCursor((c) => c + 1), calm ? Math.min(base, 260) : base / speed)
    return () => clearTimeout(t)
  }, [cursor, ev, speed])
  // Once the table has caught up, the CPU makes its next choice.
  useEffect(() => {
    if (playing || !m.req || m.req.p !== CPU) return
    const t = setTimeout(() => act(cpuChoice(m, save.level)), 380 / speed)
    return () => clearTimeout(t)
  }, [tick, playing, speed])
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [cursor, tick])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setZoom(false)
      setPile(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const opts = mine ? mine.opts.map((o, i) => ({ ...o, i })) : []
  const cardOpts = (uid: number) => opts.filter((o) => o.uid === uid)
  const trayKinds = mine && (mine.kind === 'pick' || mine.kind === 'check' || mine.kind === 'confirm')
  const tray = trayKinds ? [...new Set([...(mine!.show || []), ...opts.filter((o) => o.uid != null).map((o) => o.uid!)])] : []
  // When there is only one card to decide about, it is picked for you.
  const only = trayKinds ? [...new Set(opts.filter((o) => o.uid != null).map((o) => o.uid!))] : []
  const chosen = sel != null && cardOpts(sel).length ? sel : only.length === 1 ? only[0] : null
  const chosenOpts = chosen != null ? cardOpts(chosen) : []
  const plain = opts.filter((o) => o.uid == null && o.t !== 'stack')
  const stackOpts = opts.filter((o) => o.t === 'stack')
  const targetAt = (side: Side, line: number) =>
    stackOpts.find((o) => o.side === side && o.line === line) || (side === ME ? chosenOpts.find((o) => o.line === line && o.via) : undefined)

  const show = (uid: number) => setLook(m.s.cards[uid])
  // On a phone there is no side panel, so a tapped card opens large instead.
  const peek = (uid: number) => {
    show(uid)
    if (window.innerWidth < 1000) setZoom(true)
  }
  const pickCard = (uid: number) => {
    unlockSound()
    play('click')
    show(uid)
    setSel(cardOpts(uid).length ? uid : null)
  }
  const lookDef = look ? DEFS.get(look)! : null
  const fightLine = v.line
  const nm = (side: Side) => m.nm(side)

  /** The animation, if any, that the current event plays on one cell of the table. */
  const cellFx = (side: Side, line: number) => {
    if (!ev || ev.line !== line) return ''
    if (ev.t === 'clash') return ev.winner == null ? 'fx-clash' : ev.winner === side ? 'fx-clash fx-won' : 'fx-clash fx-lost'
    if (ev.p !== side) return ''
    return ev.t === 'summon' || ev.t === 'waza' || ev.t === 'down' || ev.t === 'destroy' || ev.t === 'recover' ? `fx-${ev.t}` : ''
  }
  const sideFx = (side: Side, kinds: string[]) => (ev && ev.p === side && kinds.includes(ev.t) ? `fx-${ev.t}` : '')

  const row = (side: Side) => (
    <div className={`lines ${side === ME ? 'mine' : 'theirs'}`}>
      {[0, 1, 2, 3, 4].map((line) => {
        const P = v.ps[side]
        const st = P.lines[line]
        const top = st ? st.cards[st.cards.length - 1] : null
        const target = targetAt(side, line)
        const pw = v.pw[side][line]
        const other = v.ps[1 - side].lines[line] ? v.pw[1 - side][line] : -1
        const zone = P.waza[line]
        const fx = cellFx(side, line)
        return (
          <div
            key={fx ? `${line}-${cursor}` : line}
            className={`cell ${fightLine === line ? 'fight' : ''} ${target ? 'target' : ''} ${st?.down ? 'down' : ''} ${fx}`}
            onClick={() => (target ? act(target.i) : top != null ? peek(top) : undefined)}
            role={target || top != null ? 'button' : undefined}
          >
            {top != null ? (
              <>
                <img className="card" src={img(m.s.cards[top], view)} alt={m.name(top)} draggable={false} />
                <span className={`pw ${fightLine === line && pw > other ? 'lead' : ''}`}>{pw}</span>
                {st!.cards.length > 1 ? <span className="under">+{st!.cards.length - 1} under</span> : null}
                {st!.down ? <span className="state">Downed</span> : null}
                {v.dd[side][line] ? <span className="dd">×2</span> : null}
              </>
            ) : (
              <span className="slot">{line + 1}</span>
            )}
            {zone.length ? (
              <span className="zone">
                {zone.map((z) => (
                  <img key={z.uid} src={img(m.s.cards[z.uid], view)} alt={m.name(z.uid)} title={`${m.name(z.uid)}${z.boost ? ' (Boost)' : ''}`} />
                ))}
              </span>
            ) : null}
            {fx === 'fx-destroy' || fx.includes('fx-clash') ? <i className="burst" /> : null}
          </div>
        )
      })}
    </div>
  )

  // One player's half of the table, laid out like the official play sheet:
  // Hearts on the left, the five lines in the middle, deck and Graveyard on the right,
  // and the Ena Zone along the outer edge.
  const half = (side: Side) => {
    const P = v.ps[side]
    const graveTop = P.grave[P.grave.length - 1]
    const unused = P.ena.filter((e) => !e.used).length
    return (
      <section className={`half ${side === ME ? 'mine' : 'theirs'}`}>
        <div key={sideFx(side, ['damage']) ? `h${cursor}` : 'h'} className={`zone-hearts ${sideFx(side, ['damage'])}`}>
          <span className="zlabel">Hearts <b>{P.hearts.length}</b></span>
          <div className="heart-stack">
            {[...P.hearts].reverse().map((h) => <i key={h.uid} className={`cb ${h.down ? 'down' : ''}`} title={h.down ? 'Downed Heart' : 'Heart'} />)}
            {!P.hearts.length ? <span className="no-hearts">No Hearts left</span> : null}
          </div>
        </div>
        {row(side)}
        <div key={sideFx(side, ['charge', 'ena']) ? `e${cursor}` : 'e'} className={`zone-ena ${sideFx(side, ['charge', 'ena'])}`}>
          <span className="zlabel">Ena <b>{unused}/{P.ena.length}</b></span>
          <div className="ena-cards">
            {P.ena.map((e) => (
              <img key={e.uid} className={e.used ? 'used' : ''} src={img(m.s.cards[e.uid], view)} alt={m.name(e.uid)} title={`${m.name(e.uid)}${e.used ? ' (used)' : ''}`} draggable={false} onClick={() => peek(e.uid)} />
            ))}
          </div>
        </div>
        <div className="zone-piles">
          <div key={sideFx(side, ['draw']) ? `d${cursor}` : 'd'} className={`pile-slot ${sideFx(side, ['draw'])}`} title="Deck">
            {P.deck.length ? <i className="cb" /> : <i className="cb none" />}
            <span className="zlabel">Deck <b>{P.deck.length}</b></span>
          </div>
          <button className="pile-slot" disabled={!P.grave.length} onClick={() => setPile({ title: `${nm(side)}: Graveyard`, uids: [...P.grave].reverse() })}>
            {graveTop != null ? <img src={img(m.s.cards[graveTop], view)} alt="" draggable={false} /> : <i className="cb none" />}
            <span className="zlabel">Graveyard <b>{P.grave.length}</b></span>
          </button>
        </div>
      </section>
    )
  }
  const plate = (side: Side) => (
    <div className={`plate ${side === ME ? 'mine' : 'theirs'}`}>
      <span className="who-name">{nm(side)}</span>
      {v.first === side && v.round > 0 && v.phase !== 'over' ? <em>First Player</em> : null}
      <span className="plate-stat">Hand <b>{v.ps[side].hand.length}</b></span>
    </div>
  )

  // The log only shows what has already been played back on the table.
  const shown = m.log.length - (m.events.length - cursor)
  const rounds: { round: number; lines: string[] }[] = []
  for (const l of m.log.slice(0, shown)) {
    const last = rounds[rounds.length - 1]
    if (last && last.round === l.round) last.lines.push(l.text)
    else rounds.push({ round: l.round, lines: [l.text] })
  }

  // What is happening right now, in words.
  const who = v.active === ME ? 'Your' : "CPU's"
  const step = v.round === 0 ? 'Getting ready'
    : v.phase === 'summon' ? `${who} Summon Phase`
    : v.phase === 'battle' ? (v.line >= 0 ? `Battle Phase · Line ${v.line + 1}` : 'Battle Phase')
    : v.phase === 'end' ? 'End Phase' : 'Match over'
  const banner = ev && ['round', 'phase', 'line', 'victory', 'trigger', 'first'].includes(ev.t)
    ? ev.t === 'round' ? { big: `Round ${v.round}`, small: `${nm(v.first)} ${v.first === ME ? 'go' : 'goes'} first` }
    : ev.t === 'phase' ? { big: step.replace(/ · .*/, ''), small: '' }
    : ev.t === 'line' ? { big: `Line ${ev.line! + 1}`, small: 'Battle' }
    : ev.t === 'victory' ? { big: ev.p === ME ? 'You win' : 'You lose', small: 'Finishing Blow' }
    : ev.t === 'trigger' ? { big: DEFS.get(m.s.cards[ev.uid!])!.trigger, small: m.name(ev.uid!) }
    : { big: ev.text.replace(/\.$/, ''), small: '' }
    : null

  return (
    <main className="table" onPointerDown={unlockSound} style={{ '--spd': speed } as React.CSSProperties}>
      <div className="board">
        <div className="cpu-row">
          {plate(CPU)}
          <div className="cpu-hand" aria-label={`CPU hand: ${v.ps[CPU].hand.length} cards`}>
            {v.ps[CPU].hand.map((u) => <i key={u} className="cb" />)}
          </div>
          <div className="controls">
            <div className="seg" role="group" aria-label="Animation speed">
              {[1, 2, 3].map((n) => <button key={n} className={speed === n ? 'on' : ''} onClick={() => setSpeed(n)}>{n}×</button>)}
            </div>
            <button className="ctl" onClick={() => { unlockSound(); setSoundOn(!sound) }} aria-pressed={sound}>Sound {sound ? 'on' : 'off'}</button>
          </div>
        </div>
        <div className="phasebar" aria-live="polite">
          <span className="phase-round">Round <b>{Math.max(v.round, 1)}</b></span>
          <ol>
            {PHASES.map(([key, label]) => <li key={key} className={v.phase === key ? 'on' : ''}>{label} Phase</li>)}
          </ol>
          <span className="phase-step">{step}</span>
        </div>
        <div className="mat">
          {half(CPU)}
          <div className="mid">
            {[0, 1, 2, 3, 4].map((line) => <span key={line} className={fightLine === line ? 'on' : ''}>Line {line + 1}</span>)}
          </div>
          {half(ME)}
          {banner ? (
            <div key={cursor} className={`banner banner-${ev!.t} ${ev!.t === 'victory' && ev!.p !== ME ? 'lost' : ''}`}>
              {ev!.t === 'trigger' ? <img src={img(m.s.cards[ev!.uid!], view)} alt="" /> : null}
              <div>
                <strong>{banner.big}</strong>
                {banner.small ? <span>{banner.small}</span> : null}
              </div>
            </div>
          ) : null}
          {ev && ev.t === 'waza' ? (
            <div key={cursor} className={`flash-card ${ev.p === ME ? 'mine' : 'theirs'}`}>
              <img src={img(m.s.cards[ev.uid!], view)} alt="" />
              <span>{ev.boost ? 'Boost' : 'Waza'}</span>
            </div>
          ) : null}
        </div>
        {plate(ME)}
        <div className="hand">
          {v.ps[ME].hand.map((u) => (
            <button key={u} className={`hand-card ${cardOpts(u).length ? 'can' : ''} ${chosen === u ? 'sel' : ''}`} onClick={() => pickCard(u)}>
              <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
            </button>
          ))}
          {!v.ps[ME].hand.length ? <span className="empty">Your hand is empty.</span> : null}
        </div>
        <div className="prompt" aria-live="polite">
          {over ? (
            <>
              <p className="result">{m.s.winner === ME ? 'You win.' : 'You lose.'} <span>{m.s.reason}</span></p>
              <div className="choices">
                <button className="btn" onClick={onAgain}>Play again</button>
                <button className="ghost" onClick={onMenu}>Change decks</button>
              </div>
            </>
          ) : playing ? (
            <>
              <p className="caption" key={cursor}>{ev!.text}</p>
              <div className="choices"><button className="ghost" onClick={skip}>Skip animation</button></div>
            </>
          ) : !mine ? (
            <p className="wait">The CPU is thinking…</p>
          ) : (
            <>
              <p>{mine.text}</p>
              {tray.length ? (
                <div className="tray">
                  {tray.map((u) => (
                    <button key={u} className={`hand-card ${cardOpts(u).length ? 'can' : 'dim'} ${chosen === u ? 'sel' : ''}`} onClick={() => pickCard(u)}>
                      <img src={img(m.s.cards[u], view)} alt={m.name(u)} draggable={false} />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="choices">
                {chosen != null ? <span className="chosen">{m.name(chosen)}</span> : null}
                {chosenOpts.map((o) => <button key={o.i} className="btn" onClick={() => act(o.i)}>{shortLabel(o, chosen != null ? m.name(chosen) : '')}</button>)}
                {chosen != null ? <button className="ghost view" onClick={() => setZoom(true)}>View card</button> : null}
                {stackOpts.map((o) => <button key={o.i} className="btn" onClick={() => act(o.i)}>{o.label}</button>)}
                {plain.map((o) => <button key={o.i} className={o.t === 'yes' || o.t === 'keep' ? 'btn' : 'ghost'} onClick={() => act(o.i)}>{o.label}</button>)}
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
              <p className="peek-facts">
                {lookDef.type} · {lookDef.color} · Cost {lookDef.cost} · Power {lookDef.power}{lookDef.boost ? ` · Boost +${lookDef.boost}` : ''}
              </p>
              {lookDef.effect ? <p className="peek-text">{lookDef.effect}</p> : null}
              {lookDef.triggerText ? <p className="peek-text"><b>{lookDef.trigger}:</b> {lookDef.triggerText}</p> : null}
            </>
          ) : (
            <p className="peek-empty">Click a card to read it here.</p>
          )}
        </div>
        <h3 className="log-title">Match log</h3>
        <ol className="log" ref={logRef}>
          {rounds.map((r) => (
            <li key={r.round}>
              {r.round ? <b>Round {r.round}</b> : <b>Setup</b>}
              {r.lines.filter((t) => !t.startsWith('Round ')).map((t, i) => <span key={i} className={/Phase\.$|^Line \d battle\.$/.test(t) ? 'log-phase' : ''}>{t}</span>)}
            </li>
          ))}
        </ol>
      </aside>

      {zoom && lookDef ? (
        <div className="shade" onClick={() => setZoom(false)}>
          <div className="zoom" onClick={(e) => e.stopPropagation()}>
            <img src={img(lookDef.id, view, true)} alt={lookDef.name} />
            <div>
              <h3>{lookDef.name}</h3>
              {lookDef.effect ? <p className="peek-text">{lookDef.effect}</p> : null}
              {lookDef.triggerText ? <p className="peek-text"><b>{lookDef.trigger}:</b> {lookDef.triggerText}</p> : null}
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

/** Options sit under the chosen card's name, so the name is dropped from the button. */
function shortLabel(o: Opt, name: string) {
  if (o.t === 'card') return 'Choose'
  if (o.t === 'waza') return o.label.replace(`Use ${name}`, 'Use Waza')
  if (o.t === 'boost') return o.label.replace(`Boost with ${name}`, 'Use as Boost')
  return o.label.replace(`${name}: `, '')
}
