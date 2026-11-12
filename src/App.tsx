import { useEffect, useMemo, useState } from 'react'
import raw from './horobeat.json'
import { authReady, currentAccount, signInWithGoogle, signOut, type Account } from './auth'
import { renderDeckImage } from './deckImage'
import { deleteDeck, listDecks, listPublicDecks, saveDeck as saveCloudDeck, type CloudDeck, type PublicDeck } from './cloud'

type Card = {
  id: string; no: string; name: string; jp: string; set: string; rarity: string; type: string; color: string
  cost: number | null; power: number | null; boost: number | null; trigger: string; keyword: string; tribe: string
  effect: string; triggerText: string; flavor: string; artist: string
}
type View = 'en' | 'jp'
type Deck = Record<string, number>
type Saved = { id: string; name: string; deck: Deck; at: number }

const CARDS = raw as Card[]
const BY_ID = new Map(CARDS.map((c) => [c.id, c]))
const DECK_SIZE = 50
const MAX_COPIES = 4
const COLORS = ['Red', 'Green', 'Blue']
const TYPES = ['Horobeat', 'Waza']
const RARITIES = ['C', 'UC', 'R', 'SR', 'DR', 'SEC']
const TRIGGERS = ['Entry Trigger', 'Over Trigger', 'Draw Trigger', 'Last Over Trigger']
const KEYWORDS = ['Barrier', 'Double Damage', 'Resonance', 'Ena Reading']
const SETS = [...new Set(CARDS.map((c) => c.set))].sort()
const TRIBES = [...new Set(CARDS.map((c) => c.tribe).filter(Boolean))].sort()
const COSTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const COLOR_HEX: Record<string, string> = { Red: '#d2332a', Green: '#2f9144', Blue: '#1f79c9' }

// The rule counts copies by card name, so every printing of a name shares one limit.
const nameKey = (c: Card) => c.jp || c.name
const img = (c: Card, view: View, large = false) => `/cards/horobeat/${view}${large ? '-lg' : ''}/${c.id}.webp`

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode: the deck still works for this visit */
    }
  },
}

const encodeDeck = (deck: Deck) =>
  Object.entries(deck)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}.${n}`)
    .join('~')
function decodeDeck(code: string): Deck {
  const deck: Deck = {}
  for (const part of code.split('~')) {
    const [id, n] = part.split('.')
    const qty = Number(n)
    if (BY_ID.has(id) && Number.isInteger(qty) && qty > 0) deck[id] = Math.min(qty, MAX_COPIES)
  }
  return deck
}
function readHash(): { deck: Deck; name: string } | null {
  const params = new URLSearchParams(location.hash.slice(1))
  const d = params.get('d')
  return d ? { deck: decodeDeck(d), name: params.get('n') || '' } : null
}

function toggle<T>(set: Set<T>, value: T) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export default function App() {
  const shared = useMemo(readHash, [])
  const [view, setView] = useState<View>(() => store.get<View>('hb.view', 'en'))
  const [deck, setDeck] = useState<Deck>(() => shared?.deck ?? store.get<Deck>('hb.deck', {}))
  const [name, setName] = useState(() => shared?.name || store.get('hb.name', ''))
  const [saved, setSaved] = useState<Saved[]>(() => store.get<Saved[]>('hb.saved', []))
  const [q, setQ] = useState('')
  const [colors, setColors] = useState(new Set<string>())
  const [types, setTypes] = useState(new Set<string>())
  const [costs, setCosts] = useState(new Set<number>())
  const [rarities, setRarities] = useState(new Set<string>())
  const [triggers, setTriggers] = useState(new Set<string>())
  const [keywords, setKeywords] = useState(new Set<string>())
  const [tribe, setTribe] = useState('')
  const [setName_, setSetName] = useState('')
  const [sort, setSort] = useState('number')
  const [open, setOpen] = useState<Card | null>(null)
  const [panel, setPanel] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [note, setNote] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [cloud, setCloud] = useState<CloudDeck[]>([])
  const [cloudId, setCloudId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [mode, setMode] = useState<'build' | 'browse'>('build')
  const [publicDecks, setPublicDecks] = useState<PublicDeck[] | null>(null)
  const [publicError, setPublicError] = useState('')
  const [picture, setPicture] = useState<{ url: string; blob: Blob } | null>(null)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => store.set('hb.view', view), [view])
  useEffect(() => store.set('hb.deck', deck), [deck])
  useEffect(() => store.set('hb.name', name), [name])
  useEffect(() => store.set('hb.saved', saved), [saved])
  useEffect(() => {
    if (shared) history.replaceState(null, '', location.pathname)
  }, [shared])
  useEffect(() => {
    let live = true
    currentAccount().then((a) => live && setAccount(a))
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (mode !== 'browse') return
    setPublicError('')
    listPublicDecks()
      .then(setPublicDecks)
      .catch((e: Error) => setPublicError(e.message))
  }, [mode])
  useEffect(() => {
    if (!account) return setCloud([])
    listDecks()
      .then(setCloud)
      .catch((e: Error) => setNote(e.message))
  }, [account])
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 2200)
    return () => clearTimeout(t)
  }, [note])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(null)
      closePicture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const byName = useMemo(() => {
    const m = new Map<string, number>()
    for (const [id, n] of Object.entries(deck)) {
      const c = BY_ID.get(id)
      if (c) m.set(nameKey(c), (m.get(nameKey(c)) || 0) + n)
    }
    return m
  }, [deck])
  const total = useMemo(() => Object.values(deck).reduce((a, b) => a + b, 0), [deck])
  const copies = (c: Card) => byName.get(nameKey(c)) || 0
  const canAdd = (c: Card) => copies(c) < MAX_COPIES

  function change(c: Card, delta: number) {
    setDeck((d) => {
      const cur = d[c.id] || 0
      if (delta > 0 && !canAdd(c)) return d
      const next = Math.max(0, cur + delta)
      const copy = { ...d }
      if (next) copy[c.id] = next
      else delete copy[c.id]
      return copy
    })
  }

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = CARDS.filter(
      (c) =>
        (!colors.size || colors.has(c.color)) &&
        (!types.size || types.has(c.type)) &&
        (!costs.size || (c.cost != null && costs.has(Math.min(c.cost, 10)))) &&
        (!rarities.size || rarities.has(c.rarity)) &&
        (!triggers.size || triggers.has(c.trigger)) &&
        (!keywords.size || [...keywords].some((k) => c.keyword.includes(k))) &&
        (!tribe || c.tribe === tribe) &&
        (!setName_ || c.set === setName_) &&
        (!needle || `${c.name} ${c.jp} ${c.no} ${c.effect} ${c.tribe}`.toLowerCase().includes(needle)),
    )
    const cmp: Record<string, (a: Card, b: Card) => number> = {
      number: (a, b) => a.no.localeCompare(b.no) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity),
      cost: (a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.name.localeCompare(b.name),
      power: (a, b) => (b.power ?? -1) - (a.power ?? -1) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return out.sort(cmp[sort])
  }, [q, colors, types, costs, rarities, triggers, keywords, tribe, setName_, sort])

  const entries = useMemo(
    () =>
      Object.entries(deck)
        .map(([id, n]) => ({ card: BY_ID.get(id)!, n }))
        .filter((e) => e.card)
        .sort((a, b) => (a.card.cost ?? 99) - (b.card.cost ?? 99) || a.card.name.localeCompare(b.card.name)),
    [deck],
  )
  const stats = useMemo(() => {
    const curve = COSTS.map(() => 0)
    const color: Record<string, number> = {}
    const trig: Record<string, number> = {}
    let horobeat = 0
    for (const { card, n } of entries) {
      if (card.cost != null) curve[Math.min(Math.max(card.cost, 1), 10) - 1] += n
      color[card.color] = (color[card.color] || 0) + n
      if (card.trigger) trig[card.trigger] = (trig[card.trigger] || 0) + n
      if (card.type === 'Horobeat') horobeat += n
    }
    return { curve, color, trig, horobeat, waza: total - horobeat }
  }, [entries, total])

  const anyFilter = colors.size || types.size || costs.size || rarities.size || triggers.size || keywords.size || tribe || setName_ || q
  function clearFilters() {
    setColors(new Set()); setTypes(new Set()); setCosts(new Set()); setRarities(new Set())
    setTriggers(new Set()); setKeywords(new Set()); setTribe(''); setSetName(''); setQ('')
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNote(done)
    } catch {
      setNote('Copy was blocked by the browser')
    }
  }
  const shareUrl = () => `${location.origin}${location.pathname}#d=${encodeDeck(deck)}${name ? `&n=${encodeURIComponent(name)}` : ''}`
  const textList = () =>
    [name || 'Untitled deck', `${total}/${DECK_SIZE} cards`, '', ...entries.map(({ card, n }) => `${n} ${card.no} ${view === 'jp' && card.jp ? card.jp : card.name}`)].join('\n')

  async function saveDeck() {
    if (!total || busy) return
    const label = name.trim() || 'Untitled deck'
    if (account) {
      setBusy(true)
      try {
        const saved = await saveCloudDeck({ id: cloudId ?? undefined, name: label, cards: deck, isPublic: isPublic && total === DECK_SIZE, author: account.name })
        setCloudId(saved.id)
        setIsPublic(saved.isPublic)
        setCloud((all) => [saved, ...all.filter((d) => d.id !== saved.id)])
        setNote(saved.isPublic ? `Saved "${saved.name}" as a public deck` : `Saved "${saved.name}" to your account`)
      } catch (e) {
        setNote((e as Error).message)
      } finally {
        setBusy(false)
      }
      return
    }
    setSaved((s) => [{ id: String(Date.now()), name: label, deck, at: Date.now() }, ...s.filter((x) => x.name !== label)].slice(0, 30))
    setNote(`Saved "${label}" on this device`)
  }

  const fileName = () => `${(name.trim() || 'horobeat-deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'horobeat-deck'}.png`
  async function makePicture() {
    if (!total || drawing) return
    setDrawing(true)
    try {
      const blob = await renderDeckImage({
        name: name.trim(),
        total,
        size: DECK_SIZE,
        curve: stats.curve,
        groups: TYPES.map((t) => {
          const rows = entries.filter((e) => e.card.type === t)
          return { label: t, count: rows.reduce((a, r) => a + r.n, 0), cards: rows.map((r) => ({ src: img(r.card, view), qty: r.n })) }
        }),
        colors: COLORS.filter((c) => stats.color[c]).map((c) => ({ label: c, color: COLOR_HEX[c], count: stats.color[c] })),
        site: location.host,
      })
      setPicture((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { url: URL.createObjectURL(blob), blob }
      })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setDrawing(false)
    }
  }
  function closePicture() {
    setPicture((old) => {
      if (old) URL.revokeObjectURL(old.url)
      return null
    })
  }
  const pictureFile = () => (picture ? new File([picture.blob], fileName(), { type: 'image/png' }) : null)
  const canShare = () => {
    const f = pictureFile()
    return Boolean(f && navigator.canShare?.({ files: [f] }))
  }
  async function sharePicture() {
    const f = pictureFile()
    if (!f) return
    try {
      await navigator.share({ files: [f], title: name.trim() || 'HORO-BEAT deck' })
    } catch {
      /* the share sheet was closed */
    }
  }

  // A new deck is a blank one with no link to a saved deck, so saving it never overwrites the previous deck.
  function newDeck() {
    if (total && !window.confirm('Start a new deck? Any changes you have not saved will be lost.')) return
    setDeck({})
    setName('')
    setCloudId(null)
    setIsPublic(false)
    setNote('Started a new deck')
  }

  // Opening someone's public deck gives you your own copy; saving it never changes theirs.
  function openPublic(d: PublicDeck) {
    if (total && !window.confirm(`Open "${d.name}"? Any changes you have not saved will be lost.`)) return
    const copy: Deck = {}
    for (const [id, n] of Object.entries(d.cards)) if (BY_ID.has(id)) copy[id] = n
    setDeck(copy)
    setName(d.name)
    setCloudId(null)
    setIsPublic(false)
    setMode('build')
    setPanel(true)
    setNote(`Opened a copy of "${d.name}"`)
  }

  async function removeCloud(d: CloudDeck) {
    if (!window.confirm(`Delete "${d.name}" from your account?`)) return
    try {
      await deleteDeck(d.id)
      setCloud((all) => all.filter((x) => x.id !== d.id))
      if (cloudId === d.id) setCloudId(null)
    } catch (e) {
      setNote((e as Error).message)
    }
  }
  async function leave() {
    await signOut()
    setAccount(null)
    setCloudId(null)
    setIsPublic(false)
  }

  const status = total === DECK_SIZE ? 'Deck is legal' : total < DECK_SIZE ? `${DECK_SIZE - total} more to reach ${DECK_SIZE}` : `${total - DECK_SIZE} over the ${DECK_SIZE}-card limit`
  const maxCurve = Math.max(1, ...stats.curve)

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="/">
          <span className="brand-game">HORO-BEAT</span>
          <span className="brand-tool">Deck Builder</span>
        </a>
        <div className="seg" role="group" aria-label="Card language">
          <button className={view === 'en' ? 'on' : ''} onClick={() => setView('en')}>English</button>
          <button className={view === 'jp' ? 'on' : ''} onClick={() => setView('jp')}>日本語</button>
        </div>
        {authReady ? (
          account ? (
            <div className="who">
              <span title={account.email}>{account.name}</span>
              <button onClick={leave}>Sign out</button>
            </div>
          ) : (
            <button className="signin" onClick={() => signInWithGoogle().catch((e: unknown) => setNote(signInProblem(e)))}>
              Sign in with Google
            </button>
          )
        ) : null}
        <button className="deck-toggle" onClick={() => setPanel(true)}>
          Deck <b>{total}</b>/{DECK_SIZE}
        </button>
      </header>

      <nav className="tabs" aria-label="Sections">
        <button className={mode === 'build' ? 'on' : ''} onClick={() => setMode('build')}>Deck builder</button>
        <button className={mode === 'browse' ? 'on' : ''} onClick={() => setMode('browse')}>Public decks</button>
      </nav>

      <div className={`layout ${mode === 'browse' ? 'browse' : ''}`}>
        <aside className={`filters ${filtersOpen ? 'show' : ''}`}>
          <div className="filters-head">
            <h2>Filters</h2>
            <button className="link" onClick={() => setFiltersOpen(false)}>Done</button>
          </div>
          <Group title="Color">
            <div className="chips">
              {COLORS.map((c) => (
                <button key={c} className={`chip color-${c.toLowerCase()} ${colors.has(c) ? 'on' : ''}`} onClick={() => setColors(toggle(colors, c))}>
                  <i />{c}
                </button>
              ))}
            </div>
          </Group>
          <Group title="Type">
            {TYPES.map((t) => <Check key={t} label={t} on={types.has(t)} onChange={() => setTypes(toggle(types, t))} />)}
          </Group>
          <Group title="Cost">
            <div className="costs five">
              {COSTS.map((n) => (
                <button key={n} className={costs.has(n) ? 'on' : ''} onClick={() => setCosts(toggle(costs, n))}>{n}</button>
              ))}
            </div>
          </Group>
          <Group title="Trigger">
            {TRIGGERS.map((t) => <Check key={t} label={t.replace(' Trigger', '')} on={triggers.has(t)} onChange={() => setTriggers(toggle(triggers, t))} />)}
          </Group>
          <Group title="Keyword">
            {KEYWORDS.map((k) => <Check key={k} label={k} on={keywords.has(k)} onChange={() => setKeywords(toggle(keywords, k))} />)}
          </Group>
          <Group title="Rarity">
            <div className="costs">
              {RARITIES.map((r) => (
                <button key={r} className={rarities.has(r) ? 'on' : ''} onClick={() => setRarities(toggle(rarities, r))}>{r}</button>
              ))}
            </div>
          </Group>
          <Group title="Tribe">
            <select value={tribe} onChange={(e) => setTribe(e.target.value)}>
              <option value="">Any tribe</option>
              {TRIBES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Group>
          <Group title="Set">
            <select value={setName_} onChange={(e) => setSetName(e.target.value)}>
              <option value="">Any set</option>
              {SETS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Group>
        </aside>

        <main className="pool">
          <div className="toolbar">
            <input type="search" placeholder="Search name, number or card text" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="only-small" onClick={() => setFiltersOpen(true)}>Filters</button>
            <label className="sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="number">Card number</option>
                <option value="cost">Cost</option>
                <option value="power">Power</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          <div className="count">
            {list.length} of {CARDS.length} cards
            {anyFilter ? <button className="link" onClick={clearFilters}>Clear filters</button> : null}
          </div>
          {list.length === 0 ? (
            <p className="empty">No cards match. Try removing a filter.</p>
          ) : (
            <div className="grid">
              {list.map((c) => {
                const n = deck[c.id] || 0
                return (
                  <div key={c.id} className={`tile ${n ? 'in' : ''}`}>
                    <button className="art" onClick={() => setOpen(c)} aria-label={`Details for ${c.name}`}>
                      <img src={img(c, view)} alt={c.name} loading="lazy" width={300} height={419} />
                      {n ? <span className="qty">{n}</span> : null}
                    </button>
                    <div className="stepper">
                      <button onClick={() => change(c, -1)} disabled={!n} aria-label={`Remove ${c.name}`}>−</button>
                      <span>{copies(c)}/{MAX_COPIES}</span>
                      <button onClick={() => change(c, 1)} disabled={!canAdd(c)} aria-label={`Add ${c.name}`}>+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>

        <main className="pool pubview">
          {publicError ? (
            <p className="empty">{publicError}</p>
          ) : !publicDecks ? (
            <p className="empty">Loading public decks</p>
          ) : publicDecks.length === 0 ? (
            <p className="empty">No public decks yet. Build a full 50-card deck, tick "Make this deck public" and save it to be the first.</p>
          ) : (
            <>
              <div className="count">{publicDecks.length} public {publicDecks.length === 1 ? 'deck' : 'decks'}, newest first</div>
              <ul className="pubs">
                {publicDecks.map((d) => {
                  const cards = Object.entries(d.cards)
                    .map(([id, n]) => ({ card: BY_ID.get(id), n }))
                    .filter((e): e is { card: Card; n: number } => Boolean(e.card))
                  const colorsIn = COLORS.filter((c) => cards.some((e) => e.card.color === c))
                  const key = [...cards].sort((a, b) => b.n - a.n || (b.card.cost ?? 0) - (a.card.cost ?? 0)).slice(0, 7)
                  return (
                    <li key={d.id}>
                      <button className="pub" onClick={() => openPublic(d)}>
                        <span className="pub-main">
                          <b>{d.name}</b>
                          <small>
                            by {d.author}, {new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </small>
                        </span>
                        <span className="pub-colors">
                          {colorsIn.map((c) => <i key={c} className={`dot color-${c.toLowerCase()}`} title={c} />)}
                        </span>
                        <span className="pub-thumbs">
                          {key.map((e) => <img key={e.card.id} src={img(e.card, view)} alt="" loading="lazy" width={300} height={419} />)}
                        </span>
                        <span className="pub-open">Open</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </main>

        <section className={`deck ${panel ? 'show' : ''}`}>
          <div className="deck-head">
            <input className="deck-name" placeholder="Untitled deck" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <button className="new" onClick={newDeck}>New deck</button>
            <button className="link only-small" onClick={() => setPanel(false)}>Close</button>
          </div>
          <div className={`meter ${total === DECK_SIZE ? 'ok' : total > DECK_SIZE ? 'over' : ''}`}>
            <div className="meter-row">
              <span className="meter-num">{total}<small>/{DECK_SIZE}</small></span>
              <span className="meter-status">{status}</span>
            </div>
            <div className="bar"><i style={{ width: `${Math.min(100, (total / DECK_SIZE) * 100)}%` }} /></div>
          </div>

          <div className="actions">
            <button onClick={saveDeck} disabled={!total || busy}>{busy ? 'Saving' : 'Save'}</button>
            <button onClick={() => copy(shareUrl(), 'Share link copied')} disabled={!total}>Share link</button>
            <button onClick={() => copy(textList(), 'Deck list copied')} disabled={!total}>Copy list</button>
            <button onClick={makePicture} disabled={!total || drawing}>{drawing ? 'Making' : 'Image'}</button>
            <button onClick={() => total && confirmClear(() => setDeck({}))} disabled={!total}>Clear</button>
          </div>

          {account ? (
            <label className={`public ${total === DECK_SIZE ? '' : 'off'}`}>
              <input type="checkbox" checked={isPublic && total === DECK_SIZE} disabled={total !== DECK_SIZE} onChange={(e) => setIsPublic(e.target.checked)} />
              <span>
                Make this deck public
                <small>{total === DECK_SIZE ? 'Anyone can see it under Public decks after you save.' : `Only complete ${DECK_SIZE}-card decks can be public.`}</small>
              </span>
            </label>
          ) : null}

          {total === 0 ? (
            <p className="empty">Add cards with the + button. A deck is exactly {DECK_SIZE} cards, with up to {MAX_COPIES} copies of the same card name.</p>
          ) : (
            <>
              {TYPES.map((t) => {
                const rows = entries.filter((e) => e.card.type === t)
                if (!rows.length) return null
                return (
                  <div key={t} className="deck-group">
                    <h3>{t} <span>{rows.reduce((a, r) => a + r.n, 0)}</span></h3>
                    <ul>
                      {rows.map(({ card, n }) => (
                        <li key={card.id}>
                          <span className={`pip color-${card.color.toLowerCase()}`}>{card.cost ?? ''}</span>
                          <button className="row-name" onClick={() => setOpen(card)}>
                            {view === 'jp' && card.jp ? card.jp : card.name}
                            <small>{card.no} {card.rarity}</small>
                          </button>
                          <span className="row-step">
                            <button onClick={() => change(card, -1)} aria-label="Remove one">−</button>
                            <b>{n}</b>
                            <button onClick={() => change(card, 1)} disabled={!canAdd(card)} aria-label="Add one">+</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}

              <div className="stats">
                <h3>Cost curve</h3>
                <div className="curve">
                  {stats.curve.map((n, i) => (
                    <div key={i} className="col">
                      <span>{n || ''}</span>
                      <i style={{ height: `${(n / maxCurve) * 100}%` }} />
                      <em>{i + 1}</em>
                    </div>
                  ))}
                </div>
                <dl>
                  {COLORS.filter((c) => stats.color[c]).map((c) => (
                    <div key={c}><dt><i className={`dot color-${c.toLowerCase()}`} />{c}</dt><dd>{stats.color[c]}</dd></div>
                  ))}
                  {TRIGGERS.filter((t) => stats.trig[t]).map((t) => (
                    <div key={t}><dt>{t}</dt><dd>{stats.trig[t]}</dd></div>
                  ))}
                </dl>
              </div>
            </>
          )}

          {account ? (
            <div className="saved">
              <h3>Your decks <span>{cloud.length}</span></h3>
              {cloud.length ? (
                <ul>
                  {cloud.map((d) => (
                    <li key={d.id}>
                      <button className="row-name" onClick={() => { setDeck(d.cards); setName(d.name); setCloudId(d.id); setIsPublic(d.isPublic); setNote(`Loaded "${d.name}"`) }}>
                        {d.name}
                        <small>{Object.values(d.cards).reduce((a, b) => a + b, 0)} cards{d.isPublic ? ', public' : ''}</small>
                      </button>
                      <button className="link" onClick={() => removeCloud(d)}>Delete</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No saved decks yet. Build one and press Save.</p>
              )}
            </div>
          ) : authReady ? (
            <p className="hint">Sign in with Google to keep your decks on your account and open them on any device.</p>
          ) : null}

          {saved.length ? (
            <div className="saved">
              <h3>Saved on this device</h3>
              <ul>
                {saved.map((s) => (
                  <li key={s.id}>
                    <button className="row-name" onClick={() => { setDeck(s.deck); setName(s.name); setCloudId(null); setIsPublic(false); setNote(`Loaded "${s.name}"`) }}>
                      {s.name}
                      <small>{Object.values(s.deck).reduce((a, b) => a + b, 0)} cards</small>
                    </button>
                    <button className="link" onClick={() => setSaved((all) => all.filter((x) => x.id !== s.id))}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="foot">
        <p>Card images and text © Shogakukan / TOMY. English card text is a reference translation, not an official release.</p>
      </footer>

      {open ? <Detail card={open} view={view} setView={setView} n={deck[open.id] || 0} copies={copies(open)} canAdd={canAdd(open)} change={change} close={() => setOpen(null)} /> : null}
      {picture ? (
        <div className="modal" onClick={closePicture}>
          <div className="sheet picture" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Deck image">
            <button className="x" onClick={closePicture} aria-label="Close">×</button>
            <img src={picture.url} alt={`Picture of ${name.trim() || 'your deck'}`} />
            <div className="picture-actions">
              <a className="btn" href={picture.url} download={fileName()}>Download image</a>
              {canShare() ? <button className="btn" onClick={sharePicture}>Share</button> : null}
              <span>Cards are shown in {view === 'en' ? 'English' : 'Japanese'}. Switch the card language to change this.</span>
            </div>
          </div>
        </div>
      ) : null}
      {note ? <div className="toast" role="status">{note}</div> : null}
    </div>
  )
}

// Neon refuses sign-in from web addresses that are not on its trusted list; say so instead of a vague retry message.
function signInProblem(e: unknown) {
  const text = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /callback|origin|trusted|forbidden|403/i.test(text)
    ? 'Sign-in is not switched on for this web address yet.'
    : 'Sign-in could not start. Check your connection and try again.'
}

function confirmClear(run: () => void) {
  if (window.confirm('Remove every card from this deck?')) run()
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={onChange} />
      {label}
    </label>
  )
}

function Detail(p: { card: Card; view: View; setView: (v: View) => void; n: number; copies: number; canAdd: boolean; change: (c: Card, d: number) => void; close: () => void }) {
  const c = p.card
  const facts: [string, string | number | null][] = [
    ['Type', c.type], ['Color', c.color], ['Cost', c.cost], ['Power', c.power], ['Boost', c.boost ? `+${c.boost}` : null],
    ['Trigger', c.trigger], ['Keyword', c.keyword], ['Tribe', c.tribe], ['Set', c.set], ['Number', `${c.no} ${c.rarity}`], ['Illustrator', c.artist],
  ]
  return (
    <div className="modal" onClick={p.close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={c.name}>
        <button className="x" onClick={p.close} aria-label="Close">×</button>
        <div className="sheet-art">
          <img src={img(c, p.view, true)} alt={c.name} width={600} height={838} />
          <div className="seg small">
            <button className={p.view === 'en' ? 'on' : ''} onClick={() => p.setView('en')}>English</button>
            <button className={p.view === 'jp' ? 'on' : ''} onClick={() => p.setView('jp')}>日本語</button>
          </div>
        </div>
        <div className="sheet-body">
          <h2>{c.name}</h2>
          {c.jp ? <p className="jp">{c.jp}</p> : null}
          <dl className="facts">
            {facts.filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {c.effect ? <p className="text">{c.effect}</p> : null}
          {c.triggerText ? <p className="text"><b>{c.trigger}:</b> {c.triggerText}</p> : null}
          {c.flavor ? <p className="flavor">{c.flavor}</p> : null}
          <div className="sheet-actions">
            <button onClick={() => p.change(c, -1)} disabled={!p.n}>−</button>
            <span>{p.n} in deck{p.copies !== p.n ? `, ${p.copies} with other printings` : ''}</span>
            <button onClick={() => p.change(c, 1)} disabled={!p.canAdd}>+</button>
          </div>
        </div>
      </div>
    </div>
  )
}
