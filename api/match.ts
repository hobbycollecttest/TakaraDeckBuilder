import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cleanLabel, sql } from '../lib/server.js'
import { DEFS, Match, type Ev, type Side, type View } from '../src/sim/engine.js'

// Matches between two people, joined with a room code. The server keeps the real game:
// both decks, the shuffle seed and the list of choices made so far. Each player is only
// sent what they are allowed to see, so hands, decks and face-down Hearts stay hidden.
//
// It is built to be cheap. A waiting player's check-in is one tiny database read that
// answers "nothing new" most of the time; the game is only replayed when something changed.

type Row = {
  code: string; seed: number; seat0: string; seat1: string | null; name0: string; name1: string | null
  deck0: string[]; deck1: string[] | null; answers: number[]; rev: number; status: string; quit: number | null
}
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{5}$/.test(v)
const isSeat = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v)

async function setup() {
  await sql!`
    CREATE TABLE IF NOT EXISTS takaradecks_matches (
      code text PRIMARY KEY,
      seed integer NOT NULL DEFAULT 0,
      seat0 text NOT NULL, seat1 text,
      name0 text NOT NULL, name1 text,
      deck0 jsonb NOT NULL, deck1 jsonb,
      answers jsonb NOT NULL DEFAULT '[]',
      rev integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'waiting',
      quit smallint,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
}
async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code !== '42P01' && !/does not exist/i.test(e?.message || '')) throw err
    await setup()
    return run()
  }
}

function cleanDeck(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 50) return null
  const names = new Map<string, number>()
  for (const id of value) {
    const d = typeof id === 'string' ? DEFS.get(id) : undefined
    if (!d) return null
    names.set(d.name, (names.get(d.name) || 0) + 1)
    if (names.get(d.name)! > 4) return null
  }
  return value as string[]
}

/** Hide what this player may not see: the other hand, both decks, and the faces of Hearts. */
function redact(view: View, me: Side): View {
  return {
    ...view,
    ps: view.ps.map((P, p) => ({
      ...P,
      deck: P.deck.map(() => -1),
      hearts: P.hearts.map((h, i) => ({ uid: -1000 - p * 100 - i, down: h.down })),
      hand: p === me ? P.hand : P.hand.map((_, i) => -2000 - i),
      check: p === me ? P.check : P.check.map((_, i) => -3000 - i),
    })) as View['ps'],
  }
}
function seen(view: View, into: Set<number>) {
  for (const P of view.ps) {
    for (const u of [...P.hand, ...P.check, ...P.grave]) if (u >= 0) into.add(u)
    for (const e of P.ena) into.add(e.uid)
    for (const st of P.lines) st?.cards.forEach((u) => into.add(u))
    for (const z of P.waza) z.forEach((w) => into.add(w.uid))
  }
}

/** Everything one player's screen needs, starting from the last change they have already seen. */
function stateFor(row: Row, side: Side, clientRev: number) {
  const names: [string, string] = [row.name0, row.name1 || 'Opponent']
  if (row.status === 'waiting' || !row.deck1) return { rev: row.rev, status: 'waiting', code: row.code, side, names }
  const answers = row.answers
  const from = clientRev >= 0 && clientRev <= answers.length ? clientRev : answers.length
  const m = new Match({ seed: row.seed, decks: [row.deck0, row.deck1], names })
  for (let i = 0; i < from; i++) m.answer(answers[i])
  m.record = true
  for (let i = from; i < answers.length; i++) m.answer(answers[i])

  const visible = new Set<number>()
  const events: Ev[] = m.events.map((e) => {
    const view = redact(e.view, side)
    seen(view, visible)
    if (e.uid != null) visible.add(e.uid)
    return { ...e, view }
  })
  const view = redact(m.snapshot(), side)
  seen(view, visible)
  const req = m.req && m.req.p === side ? m.req : null
  if (req) {
    req.show?.forEach((u) => visible.add(u))
    req.opts.forEach((o) => o.uid != null && visible.add(o.uid))
  }
  const cards: Record<number, string> = {}
  for (const u of visible) cards[u] = m.s.cards[u]

  let phase: string = m.s.phase
  let winner = m.s.winner
  let reason = m.s.reason
  if (row.quit != null) {
    phase = 'over'
    winner = (1 - row.quit) as Side
    reason = `${names[row.quit]} left the match.`
  }
  return {
    rev: row.rev, status: phase === 'over' ? 'over' : 'playing', code: row.code, side, names,
    events, view, req: phase === 'over' ? null : req, turn: m.req ? m.req.p : null,
    log: m.log, cards, phase, winner, reason,
  }
}

const sideOf = (row: Row, seat: string): Side | null => (row.seat0 === seat ? 0 : row.seat1 === seat ? 1 : null)
const load = async (code: string) => (await withTable(() => sql!`SELECT * FROM takaradecks_matches WHERE code = ${code}`))[0] as Row | undefined

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!sql) return res.status(503).json({ error: 'Online play is not set up yet.' })
  try {
    if (req.method === 'GET') {
      const q = (k: string) => (Array.isArray(req.query[k]) ? req.query[k]![0] : req.query[k]) as string | undefined
      const code = q('code')?.toUpperCase()
      const seat = q('seat')
      const rev = Number(q('rev') ?? -1)
      if (!isCode(code) || !isSeat(seat)) return res.status(400).json({ error: 'That room code does not look right.' })
      // The cheap check: has anything changed since this player last looked?
      const head = (await withTable(() => sql!`SELECT rev, status, quit FROM takaradecks_matches WHERE code = ${code} AND (seat0 = ${seat} OR seat1 = ${seat})`))[0]
      if (!head) return res.status(404).json({ error: 'That room was not found. It may have expired.' })
      if (head.rev === rev && head.status !== 'waiting' && head.quit == null) return res.status(200).json({ same: true })
      const row = (await load(code))!
      return res.status(200).json(stateFor(row, sideOf(row, seat)!, rev))
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = (req.body || {}) as Record<string, unknown>
    const seat = body.seat
    if (!isSeat(seat)) return res.status(400).json({ error: 'Please reload the page and try again.' })
    const name = cleanLabel(body.name, 16) || 'Player'

    if (body.op === 'create') {
      const deck = cleanDeck(body.deck)
      if (!deck) return res.status(400).json({ error: 'That deck is not a legal 50-card deck.' })
      // Old rooms are cleared out whenever a new one is made.
      await withTable(() => sql!`DELETE FROM takaradecks_matches WHERE updated_at < now() - interval '2 days'`)
      for (let tries = 0; tries < 5; tries++) {
        const code = newCode()
        const rows = await sql!`
          INSERT INTO takaradecks_matches (code, seat0, name0, deck0) VALUES (${code}, ${seat}, ${name}, ${JSON.stringify(deck)}::jsonb)
          ON CONFLICT (code) DO NOTHING RETURNING *`
        if (rows.length) return res.status(200).json(stateFor(rows[0] as Row, 0, -1))
      }
      return res.status(500).json({ error: 'Could not make a room. Please try again.' })
    }

    const code = typeof body.code === 'string' ? body.code.toUpperCase() : ''
    if (!isCode(code)) return res.status(400).json({ error: 'Room codes are 5 letters and numbers.' })
    const row = await load(code)
    if (!row) return res.status(404).json({ error: 'That room was not found. Check the code, or ask for a new one.' })

    if (body.op === 'join') {
      const mine = sideOf(row, seat)
      if (mine != null) return res.status(200).json(stateFor(row, mine, -1))
      if (row.status !== 'waiting') return res.status(409).json({ error: 'That room already has two players.' })
      const deck = cleanDeck(body.deck)
      if (!deck) return res.status(400).json({ error: 'That deck is not a legal 50-card deck.' })
      const seed = Math.floor(Math.random() * 2 ** 31)
      const rows = await sql!`
        UPDATE takaradecks_matches SET seat1 = ${seat}, name1 = ${name}, deck1 = ${JSON.stringify(deck)}::jsonb, seed = ${seed}, status = 'playing', updated_at = now()
        WHERE code = ${code} AND status = 'waiting' RETURNING *`
      if (!rows.length) return res.status(409).json({ error: 'That room already has two players.' })
      return res.status(200).json(stateFor(rows[0] as Row, 1, -1))
    }

    const side = sideOf(row, seat)
    if (side == null) return res.status(403).json({ error: 'You are not in that room.' })
    const clientRev = Number.isInteger(body.rev) ? (body.rev as number) : -1

    if (body.op === 'leave') {
      if (row.status === 'waiting') {
        await sql!`DELETE FROM takaradecks_matches WHERE code = ${code} AND status = 'waiting'`
        return res.status(200).json({ gone: true })
      }
      if (row.status === 'playing' && row.quit == null) {
        const rows = await sql!`UPDATE takaradecks_matches SET quit = ${side}, status = 'over', updated_at = now() WHERE code = ${code} AND quit IS NULL RETURNING *`
        if (rows.length) return res.status(200).json(stateFor(rows[0] as Row, side, clientRev))
      }
      return res.status(200).json(stateFor((await load(code))!, side, clientRev))
    }

    if (body.op === 'act') {
      const i = body.i
      if (row.status !== 'playing' || !row.deck1) return res.status(409).json({ error: 'This match is not in progress.' })
      // A choice made against an out-of-date table is refused; the player is sent the current one.
      if (clientRev !== row.rev) return res.status(200).json(stateFor(row, side, clientRev))
      const m = Match.replay({ seed: row.seed, decks: [row.deck0, row.deck1], names: [row.name0, row.name1 || ''] }, row.answers)
      if (!m.req || m.req.p !== side) return res.status(409).json({ error: 'It is not your turn to choose.' })
      if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= m.req.opts.length) return res.status(400).json({ error: 'That is not a legal choice.' })
      m.answer(i as number)
      const status = m.s.phase === 'over' ? 'over' : 'playing'
      const rows = await sql!`
        UPDATE takaradecks_matches SET answers = answers || ${JSON.stringify([i])}::jsonb, rev = rev + 1, status = ${status}, updated_at = now()
        WHERE code = ${code} AND rev = ${row.rev} AND status = 'playing' RETURNING *`
      if (!rows.length) return res.status(200).json(stateFor((await load(code))!, side, clientRev))
      return res.status(200).json(stateFor(rows[0] as Row, side, clientRev))
    }
    return res.status(400).json({ error: 'Unknown request.' })
  } catch (err) {
    console.error('match api failed', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
