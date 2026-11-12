import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DECK_SIZE, MAX_DECKS, cleanCards, cleanLabel, configured, isUuid, signedIn, sql, usernameOf, withTable } from '../lib/server.js'

const GAMES = new Set(['horobeat'])
const shape = (r: Record<string, unknown>) => ({ id: r.id, name: r.name, cards: r.cards, isPublic: r.is_public === true, updatedAt: r.updated_at })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured || !sql) return res.status(503).json({ error: 'Deck saving is not set up yet.' })
  const user = await signedIn(req.headers.authorization)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })

  try {
    if (req.method === 'GET') {
      const rows = await withTable(() => sql!`SELECT id, name, cards, is_public, updated_at FROM takaradecks_decks WHERE user_id = ${user.id} AND game = 'horobeat' ORDER BY updated_at DESC LIMIT ${MAX_DECKS}`)
      return res.status(200).json({ decks: rows.map(shape), username: await usernameOf(user.id) })
    }

    if (req.method === 'PUT') {
      const body = (req.body || {}) as Record<string, unknown>
      const game = typeof body.game === 'string' && GAMES.has(body.game) ? body.game : null
      const cards = cleanCards(body.cards)
      if (!game || !cards) return res.status(400).json({ error: 'That deck could not be saved.' })
      const label = cleanLabel(body.name, 60) || 'Untitled deck'
      const isPublic = body.isPublic === true
      const total = Object.values(cards).reduce((a, b) => a + b, 0)
      if (isPublic && total !== DECK_SIZE) return res.status(400).json({ error: `Only complete ${DECK_SIZE}-card decks can be made public.` })
      // Public decks are shown under the player's chosen username, never their Google name or email.
      const author = isPublic ? await usernameOf(user.id) : ''
      if (isPublic && !author) return res.status(400).json({ error: 'Choose a username before making a deck public.', needsUsername: true })
      const json = JSON.stringify(cards)
      if (isUuid(body.id)) {
        const id = body.id
        const rows = await withTable(() => sql!`UPDATE takaradecks_decks SET name = ${label}, cards = ${json}::jsonb, is_public = ${isPublic}, author = ${author}, updated_at = now() WHERE id = ${id} AND user_id = ${user.id} RETURNING id, name, cards, is_public, updated_at`)
        if (rows.length) return res.status(200).json({ deck: shape(rows[0]) })
      }
      // One statement checks the deck limit and saves, instead of a count followed by an insert.
      const rows = await withTable(() => sql!`
        INSERT INTO takaradecks_decks (user_id, game, name, cards, is_public, author)
        SELECT ${user.id}::text, ${game}::text, ${label}::text, ${json}::jsonb, ${isPublic}::boolean, ${author}::text
        WHERE (SELECT count(*) FROM takaradecks_decks WHERE user_id = ${user.id}::text) < ${MAX_DECKS}::int
        RETURNING id, name, cards, is_public, updated_at`)
      if (!rows.length) return res.status(409).json({ error: `You can keep up to ${MAX_DECKS} decks. Delete one to save a new deck.` })
      return res.status(200).json({ deck: shape(rows[0]) })
    }

    if (req.method === 'DELETE') {
      const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
      if (!isUuid(id)) return res.status(400).json({ error: 'Unknown deck.' })
      await withTable(() => sql!`DELETE FROM takaradecks_decks WHERE id = ${id} AND user_id = ${user.id}`)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, PUT, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('decks api failed', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
