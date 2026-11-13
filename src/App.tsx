import { useEffect, useMemo, useState } from 'react'
import { authReady, currentAccount, signInWithGoogle, signOut, type Account } from './auth'
import { renderDeckImage } from './deckImage'
import { ApiError, deleteDeck, listDecks, listPublicDecks, saveDeck as saveCloudDeck, saveUsername, type CloudDeck, type PublicDeck } from './cloud'
import { GAMES, store, type Card, type Deck, type Game, type View } from './game'

type Saved = { id: string; name: string; deck: Deck; at: number }
type Picked = Record<string, Set<string>>

const encodeDeck = (deck: Deck) =>
  Object.entries(deck)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}.${n}`)
    .join('~')
function readHash(known: Map<string, Card>, maxCopies: number): { deck: Deck; name: string } | null {
  const params = new URLSearchParams(location.hash.slice(1))
  const d = params.get('d')
  if (!d) return null
  const deck: Deck = {}
  for (const part of d.split('~')) {
    const [id, n] = part.split('.')
    const qty = Number(n)
    if (known.has(id) && Number.isInteger(qty) && qty > 0) deck[id] = Math.min(qty, maxCopies)
  }
  return { deck, name: params.get('n') || '' }
}

function toggle<T>(set: Set<T> | undefined, value: T) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
const hue = (color: string) => ({ '--c': color }) as React.CSSProperties

export default function App({ game }: { game: Game }) {
  const CARDS = game.cards
  const BY_ID = useMemo(() => new Map(CARDS.map((c) => [c.id, c])), [CARDS])
  const DECK_SIZE = game.deckSize
  const MAX_COPIES = game.maxCopies
  const TYPES = game.types
  const img = game.img
  // HORO-BEAT keeps its original storage names so nobody loses the deck they were building.
  const key = (name: string) => `${game.key === 'horobeat' ? 'hb' : game.key}.${name}`
  const shared = useMemo(() => readHash(BY_ID, MAX_COPIES), [])
  const [view, setView] = useState<View>(() => store.get<View>(key('view'), 'en'))
  const [deck, setDeck] = useState<Deck>(() => shared?.deck ?? store.get<Deck>(key('deck'), {}))
  const [name, setName] = useState(() => shared?.name || store.get(key('name'), ''))
  const [saved, setSaved] = useState<Saved[]>(() => store.get<Saved[]>(key('saved'), []))
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Picked>({})
  const [sort, setSort] = useState('number')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Card | null>(null)
  const [panel, setPanel] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [note, setNote] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [cloud, setCloud] = useState<CloudDeck[]>([])
  const [cloudId, setCloudId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Decks are public unless the player unticks the box; only complete decks are ever published.
  const [isPublic, setIsPublic] = useState(true)
  const [username, setUsername] = useState('')
  const [nameDialog, setNameDialog] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState('')
  const [pq, setPq] = useState('')
  const [pColors, setPColors] = useState(new Set<string>())
  const [pSort, setPSort] = useState('newest')
  const [mode, setMode] = useState<'build' | 'browse'>('build')
  const [publicDecks, setPublicDecks] = useState<PublicDeck[] | null>(null)
  const [publicError, setPublicError] = useState('')
  const [picture, setPicture] = useState<{ url: string; blob: Blob } | null>(null)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => store.set(key('view'), view), [view])
  useEffect(() => store.set(key('deck'), deck), [deck])
  useEffect(() => store.set(key('name'), name), [name])
  useEffect(() => store.set(key('saved'), saved), [saved])
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
    listPublicDecks(game.key)
      .then(setPublicDecks)
      .catch((e: Error) => setPublicError(e.message))
  }, [mode])
  useEffect(() => {
    if (!account) {
      setCloud([])
      setUsername('')
      return
    }
    listDecks(game.key)
      .then((r) => {
        setCloud(r.decks)
        setUsername(r.username)
      })
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
      setNameDialog(false)
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
      if (c) m.set(game.copyKey(c), (m.get(game.copyKey(c)) || 0) + n)
    }
    return m
  }, [deck])
  const byType = useMemo(() => {
    const m = new Map<string, number>()
    for (const [id, n] of Object.entries(deck)) {
      const c = BY_ID.get(id)
      if (c) m.set(c.type, (m.get(c.type) || 0) + n)
    }
    return m
  }, [deck])
  const total = useMemo(() => Object.values(deck).reduce((a, b) => a + b, 0), [deck])
  const copies = (c: Card) => byName.get(game.copyKey(c)) || 0
  const typeFull = (c: Card) => game.typeLimits[c.type] != null && (byType.get(c.type) || 0) >= game.typeLimits[c.type]
  const canAdd = (c: Card) => copies(c) < MAX_COPIES && !typeFull(c)

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
    const active = game.filters.filter((f) => picked[f.key]?.size)
    const out = CARDS.filter((c) => active.every((f) => f.values(c).some((v) => picked[f.key].has(v))) && (!needle || game.search(c).toLowerCase().includes(needle)))
    return out.sort((game.sorts.find((x) => x.key === sort) || game.sorts[0]).cmp)
  }, [q, picked, sort])

  const entries = useMemo(
    () =>
      Object.entries(deck)
        .map(([id, n]) => ({ card: BY_ID.get(id)!, n }))
        .filter((e) => e.card)
        .sort((a, b) => game.deckSort(a.card, b.card)),
    [deck],
  )
  const stats = useMemo(() => {
    const curve = game.curve.labels.map(() => 0)
    const tag: Record<string, number> = {}
    for (const { card, n } of entries) {
      const slot = game.curve.bucket(card)
      if (slot != null) curve[slot] += n
      for (const t of game.tagsOf(card)) tag[t] = (tag[t] || 0) + n
    }
    return { curve, tag, extra: game.extraStats(entries) }
  }, [entries])

  const PAGE = 50
  const pages = Math.ceil(list.length / PAGE)
  const shown = list.slice(page * PAGE, (page + 1) * PAGE)
  useEffect(() => setPage(0), [list])
  function goPage(n: number) {
    setPage(n)
    document.querySelector('.pool')?.scrollIntoView({ block: 'start' })
  }
  const anyFilter = q || Object.values(picked).some((v) => v.size)
  function clearFilters() {
    setPicked({})
    setQ('')
  }
  const pick = (k: string, value: string) => setPicked((p) => ({ ...p, [k]: toggle(p[k], value) }))

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
      const publish = isPublic && total === DECK_SIZE
      if (publish && !username) return askUsername('Choose a username first. It is the name shown on your public decks.')
      setBusy(true)
      try {
        const saved = await saveCloudDeck({ game: game.key, id: cloudId ?? undefined, name: label, cards: deck, isPublic: publish })
        setCloudId(saved.id)
        setCloud((all) => [saved, ...all.filter((d) => d.id !== saved.id)])
        setNote(saved.isPublic ? `Saved "${saved.name}" as a public deck` : `Saved "${saved.name}" to your account`)
      } catch (e) {
        if (e instanceof ApiError && e.needsUsername) askUsername(e.message)
        else setNote((e as Error).message)
      } finally {
        setBusy(false)
      }
      return
    }
    setSaved((s) => [{ id: String(Date.now()), name: label, deck, at: Date.now() }, ...s.filter((x) => x.name !== label)].slice(0, 30))
    setNote(`Saved "${label}" on this device`)
  }

  const fileName = () => `${(name.trim() || `${game.key}-deck`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `${game.key}-deck`}.png`
  async function makePicture() {
    if (!total || drawing) return
    setDrawing(true)
    try {
      const blob = await renderDeckImage({
        name: name.trim(),
        brand: game.fullName.toUpperCase(),
        curveLabels: game.curve.labels,
        legal,
        total,
        size: DECK_SIZE,
        curve: stats.curve,
        groups: TYPES.map((t) => {
          const rows = entries.filter((e) => e.card.type === t)
          return { label: t, count: rows.reduce((a, r) => a + r.n, 0), cards: rows.map((r) => ({ src: img(r.card, view), qty: r.n })) }
        }),
        colors: game.tags.filter((c) => (stats.tag[c] || 0) >= game.tagMin).map((c) => ({ label: c, color: game.tagHex[c], count: stats.tag[c] })),
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
      await navigator.share({ files: [f], title: name.trim() || `${game.fullName} deck` })
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
    setIsPublic(true)
    setNote('Started a new deck')
  }

  function askUsername(message = '') {
    setNameDraft(username)
    setNameError(message)
    setNameDialog(true)
  }
  async function submitUsername() {
    const value = nameDraft.trim()
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(value)) return setNameError('Use 3 to 20 letters, numbers, dots, dashes or underscores.')
    setBusy(true)
    try {
      setUsername(await saveUsername(value))
      setNameDialog(false)
      setNote(`Your username is ${value}`)
    } catch (e) {
      setNameError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const publicShown = useMemo(() => {
    if (!publicDecks) return []
    const needle = pq.trim().toLowerCase()
    const rows = publicDecks
      .map((d) => {
        const cards = Object.entries(d.cards)
          .map(([id, n]) => ({ card: BY_ID.get(id), n }))
          .filter((e): e is { card: Card; n: number } => Boolean(e.card))
        return { d, cards, colors: game.tags.filter((t) => cards.reduce((a, e) => a + (game.tagsOf(e.card).includes(t) ? e.n : 0), 0) >= game.tagMin) }
      })
      .filter(
        (r) =>
          [...pColors].every((c) => r.colors.includes(c)) &&
          (!needle || `${r.d.name} ${r.d.author} ${r.cards.map((e) => `${e.card.name} ${e.card.jp} ${e.card.no}`).join(' ')} ${r.colors.join(' ')}`.toLowerCase().includes(needle)),
      )
    if (pSort === 'name') rows.sort((a, b) => a.d.name.localeCompare(b.d.name))
    if (pSort === 'author') rows.sort((a, b) => a.d.author.localeCompare(b.d.author) || a.d.name.localeCompare(b.d.name))
    return rows
  }, [publicDecks, pq, pColors, pSort])

  // Opening someone's public deck gives you your own copy; saving it never changes theirs.
  function openPublic(d: PublicDeck) {
    if (total && !window.confirm(`Open "${d.name}"? Any changes you have not saved will be lost.`)) return
    const copy: Deck = {}
    for (const [id, n] of Object.entries(d.cards)) if (BY_ID.has(id)) copy[id] = n
    setDeck(copy)
    setName(d.name)
    setCloudId(null)
    // A copy of someone else's deck stays private unless you choose to publish it.
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
    setIsPublic(true)
  }

  const overType = Object.entries(game.typeLimits).find(([t, max]) => (byType.get(t) || 0) > max)
  const legal = total === DECK_SIZE && !overType
  const status = overType
    ? `Too many ${overType[0]} cards: ${byType.get(overType[0])} of ${overType[1]} allowed`
    : total === DECK_SIZE ? 'Deck is legal' : total < DECK_SIZE ? `${DECK_SIZE - total} more to reach ${DECK_SIZE}` : `${total - DECK_SIZE} over the ${DECK_SIZE}-card limit`
  const maxCurve = Math.max(1, ...stats.curve)

  return (
    <div className="app">
      <nav className="games" aria-label="Choose a game">
        {GAMES.map((g) => (
          <a key={g.key} href={g.path} className={g.key === game.key ? 'on' : ''} aria-current={g.key === game.key ? 'page' : undefined}>
            <img src={g.logo} alt={g.title} />
          </a>
        ))}
      </nav>
      <header className="top">
        <a className="brand" href={game.path}>
          <span className="brand-game">{game.title}</span>
          <span className="brand-tool">Deck Builder</span>
        </a>
        <div className="seg" role="group" aria-label="Card language">
          <button className={view === 'en' ? 'on' : ''} onClick={() => setView('en')}>English</button>
          <button className={view === 'jp' ? 'on' : ''} onClick={() => setView('jp')}>日本語</button>
        </div>
        {authReady ? (
          account ? (
            <div className="who">
              <button className="name" onClick={() => askUsername()} title="Change your username">{username || 'Set username'}</button>
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
        {game.links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
      </nav>

      <div className={`layout ${mode === 'browse' ? 'browse' : ''}`}>
        <aside className={`filters ${filtersOpen ? 'show' : ''}`}>
          <div className="filters-head">
            <h2>Filters</h2>
            <button className="link" onClick={() => setFiltersOpen(false)}>Done</button>
          </div>
          {game.filters.map((f) => (
            <Group key={f.key} title={f.title}>
              {f.kind === 'chips' ? (
                <div className="chips">
                  {f.options.map((o) => (
                    <button key={o} className={`chip ${picked[f.key]?.has(o) ? 'on' : ''}`} style={hue(game.tagHex[o])} onClick={() => pick(f.key, o)}>
                      <i />{o}
                    </button>
                  ))}
                </div>
              ) : f.kind === 'checks' ? (
                f.options.map((o) => <Check key={o} label={f.label ? f.label(o) : o} on={Boolean(picked[f.key]?.has(o))} onChange={() => pick(f.key, o)} />)
              ) : f.kind === 'nums' ? (
                <div className="costs" style={f.cols ? { gridTemplateColumns: `repeat(${f.cols}, 1fr)` } : undefined}>
                  {f.options.map((o) => (
                    <button key={o} className={picked[f.key]?.has(o) ? 'on' : ''} onClick={() => pick(f.key, o)}>{f.label ? f.label(o) : o}</button>
                  ))}
                </div>
              ) : (
                <select value={[...(picked[f.key] || [])][0] || ''} onChange={(e) => setPicked((p) => ({ ...p, [f.key]: new Set(e.target.value ? [e.target.value] : []) }))}>
                  <option value="">Any {f.title.toLowerCase()}</option>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              )}
            </Group>
          ))}
        </aside>

        <main className="pool">
          <div className="toolbar">
            <input type="search" placeholder="Search name, number or card text" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="only-small" onClick={() => setFiltersOpen(true)}>Filters</button>
            <label className="sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {game.sorts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <div className="count">
            {list.length > PAGE ? `${page * PAGE + 1} to ${Math.min(list.length, (page + 1) * PAGE)} of ${list.length} cards` : `${list.length} of ${CARDS.length} cards`}
            {anyFilter ? <button className="link" onClick={clearFilters}>Clear filters</button> : null}
          </div>
          {list.length === 0 ? (
            <p className="empty">No cards match. Try removing a filter.</p>
          ) : (
            <div className="grid">
              {shown.map((c) => {
                const n = deck[c.id] || 0
                return (
                  <div key={c.id} className={`tile ${n ? 'in' : ''}`}>
                    <button className="art" onClick={() => setOpen(c)} aria-label={`Details for ${c.name}`}>
                      <img src={img(c, view)} alt={c.name} loading="lazy" width={300} height={419} />
                      {n ? <span className="qty">{n}</span> : null}
                    </button>
                    <div className="stepper">
                      <button onClick={() => change(c, -1)} disabled={!n} aria-label={`Remove ${c.name}`}>−</button>
                      <span>{MAX_COPIES < DECK_SIZE ? `${copies(c)}/${MAX_COPIES}` : n}</span>
                      <button onClick={() => change(c, 1)} disabled={!canAdd(c)} aria-label={`Add ${c.name}`}>+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {pages > 1 ? (
            <nav className="pager" aria-label="Pages">
              <button onClick={() => goPage(page - 1)} disabled={page === 0}>Previous</button>
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} className={i === page ? 'on' : ''} onClick={() => goPage(i)} aria-current={i === page ? 'page' : undefined}>{i + 1}</button>
              ))}
              <button onClick={() => goPage(page + 1)} disabled={page >= pages - 1}>Next</button>
            </nav>
          ) : null}
        </main>

        <main className="pool pubview">
          {publicError ? (
            <p className="empty">{publicError}</p>
          ) : !publicDecks ? (
            <p className="empty">Loading public decks</p>
          ) : publicDecks.length === 0 ? (
            <p className="empty">No public decks yet. Build a full {DECK_SIZE}-card deck, sign in and save it to be the first.</p>
          ) : (
            <>
              <div className="toolbar">
                <input type="search" placeholder="Search deck name, player or a card in the deck" value={pq} onChange={(e) => setPq(e.target.value)} />
                {game.tags.length > 4 ? (
                  <select className="ptag" aria-label="School" value={[...pColors][0] || ''} onChange={(e) => setPColors(new Set(e.target.value ? [e.target.value] : []))}>
                    <option value="">Any school</option>
                    {game.tags.map((c) => <option key={c}>{c}</option>)}
                  </select>
                ) : (
                  <div className="pcolors" role="group" aria-label="Deck colors">
                    {game.tags.map((c) => (
                      <button key={c} className={`chip ${pColors.has(c) ? 'on' : ''}`} style={hue(game.tagHex[c])} onClick={() => setPColors(toggle(pColors, c))}>
                        <i />{c}
                      </button>
                    ))}
                  </div>
                )}
                <label className="sort">
                  Sort
                  <select value={pSort} onChange={(e) => setPSort(e.target.value)}>
                    <option value="newest">Newest</option>
                    <option value="name">Deck name</option>
                    <option value="author">Player</option>
                  </select>
                </label>
              </div>
              <div className="count">
                {publicShown.length} of {publicDecks.length} public {publicDecks.length === 1 ? 'deck' : 'decks'}
                {pq || pColors.size ? <button className="link" onClick={() => { setPq(''); setPColors(new Set()) }}>Clear filters</button> : null}
              </div>
              {publicShown.length === 0 ? <p className="empty">No public decks match. Try a different search or remove a filter.</p> : null}
              <ul className="pubs">
                {publicShown.map(({ d, cards, colors: colorsIn }) => {
                  const top = [...cards].sort((a, b) => b.n - a.n || game.deckSort(b.card, a.card)).slice(0, 7)
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
                          {colorsIn.map((c) => <i key={c} className="dot" style={hue(game.tagHex[c])} title={c} />)}
                        </span>
                        <span className="pub-thumbs">
                          {top.map((e) => <img key={e.card.id} src={img(e.card, view)} alt="" loading="lazy" width={300} height={419} />)}
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
          <div className={`meter ${legal ? 'ok' : total > DECK_SIZE || overType ? 'over' : ''}`}>
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
            <label className="public">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              <span>
                Public deck
                <small>
                  {!isPublic
                    ? 'Private. Only you can see this deck.'
                    : total === DECK_SIZE
                      ? 'Anyone can see it under Public decks after you save.'
                      : `It will be shown under Public decks once it has ${DECK_SIZE} cards. Until then it saves as private.`}
                </small>
              </span>
            </label>
          ) : null}

          {total === 0 ? (
            <p className="empty">Add cards with the + button. {game.rulesLine}</p>
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
                          <span className={`pip ${game.pip(card).text.length > 1 ? 'two' : ''}`} style={hue(game.pip(card).color)}>{game.pip(card).text}</span>
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
                <h3>{game.curve.title}</h3>
                <div className="curve" style={{ gridTemplateColumns: `repeat(${stats.curve.length}, 1fr)` }}>
                  {stats.curve.map((n, i) => (
                    <div key={i} className="col">
                      <span>{n || ''}</span>
                      <i style={{ height: `${(n / maxCurve) * 100}%` }} />
                      <em>{game.curve.labels[i]}</em>
                    </div>
                  ))}
                </div>
                <dl>
                  {game.tags.filter((c) => stats.tag[c]).map((c) => (
                    <div key={c}><dt><i className="dot" style={hue(game.tagHex[c])} />{c}</dt><dd>{stats.tag[c]}</dd></div>
                  ))}
                  {stats.extra.map(([t, n]) => (
                    <div key={t}><dt>{t}</dt><dd>{n}</dd></div>
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
                      <button className="row-name" onClick={() => { setDeck(d.cards); setName(d.name); setCloudId(d.id); setIsPublic(cardCount(d.cards) === DECK_SIZE ? d.isPublic : true); setNote(`Loaded "${d.name}"`) }}>
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
                    <button className="row-name" onClick={() => { setDeck(s.deck); setName(s.name); setCloudId(null); setIsPublic(true); setNote(`Loaded "${s.name}"`) }}>
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
        <p>{game.footer}</p>
      </footer>

      {open ? <Detail game={game} showCopies={MAX_COPIES < DECK_SIZE} card={open} view={view} setView={setView} n={deck[open.id] || 0} copies={copies(open)} canAdd={canAdd(open)} change={change} close={() => setOpen(null)} /> : null}
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
      {nameDialog ? (
        <div className="modal" onClick={() => setNameDialog(false)}>
          <form className="sheet namebox" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submitUsername() }} role="dialog" aria-modal="true" aria-label="Username">
            <button type="button" className="x" onClick={() => setNameDialog(false)} aria-label="Close">×</button>
            <h2>Username</h2>
            <p className="jp">This is the name other players see on your public decks. Your Google name and email are never shown.</p>
            <input autoFocus value={nameDraft} onChange={(e) => { setNameDraft(e.target.value); setNameError('') }} maxLength={20} placeholder="3 to 20 characters" aria-label="Username" />
            {nameError ? <p className="field-error">{nameError}</p> : null}
            <div className="picture-actions">
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving' : 'Save username'}</button>
            </div>
          </form>
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

// An unfinished deck is always stored private, so its tick box goes back to the default when it is reopened.
const cardCount = (cards: Record<string, number>) => Object.values(cards).reduce((a, b) => a + b, 0)

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

function Detail(p: { game: Game; showCopies: boolean; card: Card; view: View; setView: (v: View) => void; n: number; copies: number; canAdd: boolean; change: (c: Card, d: number) => void; close: () => void }) {
  const c = p.card
  const facts = p.game.facts(c)
  const img = p.game.img
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
          {p.game.body(c)}
          <div className="sheet-actions">
            <button onClick={() => p.change(c, -1)} disabled={!p.n}>−</button>
            <span>{p.n} in deck{p.showCopies && p.copies !== p.n ? `, ${p.copies} with other printings` : ''}</span>
            <button onClick={() => p.change(c, 1)} disabled={!p.canAdd}>+</button>
          </div>
        </div>
      </div>
    </div>
  )
}
