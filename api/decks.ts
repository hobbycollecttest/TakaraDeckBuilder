import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const MAX_DECKS = 50
const MAX_ENTRIES = 120
const GAMES = new Set(['horobeat'])

const authBase = process.env.NEON_AUTH_BASE_URL || ''
const jwks = authBase ? createRemoteJWKSet(new URL(`${authBase}/.well-known/jwks.json`)) : null
const origin = authBase ? new URL(authBase).origin : ''
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null

// The table is only created when a query finds it missing, so normal requests cost one query, not three.
async function createTable() {
  await sql!`
    CREATE TABLE IF NOT EXISTS takaradecks_decks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      game text NOT NULL,
      name text NOT NULL,
      cards jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  await sql!`CREATE INDEX IF NOT EXISTS takaradecks_decks_user ON takaradecks_decks (user_id, updated_at DESC)`
}
async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if ((err as { code?: string })?.code !== '42P01') throw err
    await createTable()
    return run()
  }
}

// Signed-in players send the token Neon Auth issued them; it is checked against Neon's public keys.
async function userId(req: VercelRequest) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !jwks) return null
  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['EdDSA'], issuer: origin, audience: origin })
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

function cleanCards(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length || entries.length > MAX_ENTRIES) return null
  const cards: Record<string, number> = {}
  for (const [id, n] of entries) {
    if (!/^[a-z0-9-]{3,24}$/.test(id) || !Number.isInteger(n) || (n as number) < 1 || (n as number) > 4) return null
    cards[id] = n as number
  }
  return cards
}

const shape = (r: Record<string, unknown>) => ({ id: r.id, name: r.name, cards: r.cards, updatedAt: r.updated_at })
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!sql || !jwks) return res.status(503).json({ error: 'Deck saving is not set up yet.' })
  const user = await userId(req)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })

  try {
    if (req.method === 'GET') {
      const rows = await withTable(() => sql`SELECT id, name, cards, updated_at FROM takaradecks_decks WHERE user_id = ${user} AND game = 'horobeat' ORDER BY updated_at DESC LIMIT ${MAX_DECKS}`)
      return res.status(200).json({ decks: rows.map(shape) })
    }

    if (req.method === 'PUT') {
      const body = (req.body || {}) as Record<string, unknown>
      const game = typeof body.game === 'string' && GAMES.has(body.game) ? body.game : null
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
      const cards = cleanCards(body.cards)
      if (!game || !cards) return res.status(400).json({ error: 'That deck could not be saved.' })
      const label = name || 'Untitled deck'
      const json = JSON.stringify(cards)
      if (isUuid(body.id)) {
        const rows = await withTable(() => sql`UPDATE takaradecks_decks SET name = ${label}, cards = ${json}::jsonb, updated_at = now() WHERE id = ${body.id as string} AND user_id = ${user} RETURNING id, name, cards, updated_at`)
        if (rows.length) return res.status(200).json({ deck: shape(rows[0]) })
      }
      // One statement checks the deck limit and saves, instead of a count followed by an insert.
      const rows = await withTable(() => sql`
        INSERT INTO takaradecks_decks (user_id, game, name, cards)
        SELECT ${user}::text, ${game}::text, ${label}::text, ${json}::jsonb
        WHERE (SELECT count(*) FROM takaradecks_decks WHERE user_id = ${user}::text) < ${MAX_DECKS}::int
        RETURNING id, name, cards, updated_at`)
      if (!rows.length) return res.status(409).json({ error: `You can keep up to ${MAX_DECKS} decks. Delete one to save a new deck.` })
      return res.status(200).json({ deck: shape(rows[0]) })
    }

    if (req.method === 'DELETE') {
      const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
      if (!isUuid(id)) return res.status(400).json({ error: 'Unknown deck.' })
      await withTable(() => sql`DELETE FROM takaradecks_decks WHERE id = ${id} AND user_id = ${user}`)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('decks api failed', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
