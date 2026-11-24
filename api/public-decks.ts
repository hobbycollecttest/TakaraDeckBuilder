import type { VercelRequest, VercelResponse } from '@vercel/node'
import { gameOf, isUuid, signedIn, sql, withTable } from '../lib/server.js'

const PAGE = 200
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)

// The list is open to everyone. The only name it returns is the username the player chose, never a Google name or email.
// Liking a deck, and asking which decks you liked, needs a signed-in player.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!sql) return res.status(503).json({ error: 'Public decks are not set up yet.' })
  const game = gameOf(one(req.query.game)) || 'horobeat'
  try {
    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store')
      const user = await signedIn(req.headers.authorization)
      if (!user) return res.status(401).json({ error: 'Sign in to like decks.' })
      const body = (req.body || {}) as Record<string, unknown>
      const id = body.id
      if (!isUuid(id)) return res.status(400).json({ error: 'Unknown deck.' })
      if (body.like === false) {
        await withTable(() => sql!`DELETE FROM takaradecks_likes WHERE deck_id = ${id} AND user_id = ${user.id}`)
      } else {
        // Only decks that are public right now can be liked.
        const rows = await withTable(() => sql!`
          INSERT INTO takaradecks_likes (deck_id, user_id)
          SELECT d.id, ${user.id}::text FROM takaradecks_decks d WHERE d.id = ${id}::uuid AND d.is_public
          ON CONFLICT DO NOTHING
          RETURNING deck_id`)
        if (!rows.length) {
          const there = await sql!`SELECT 1 FROM takaradecks_decks WHERE id = ${id}::uuid AND is_public`
          if (!there.length) return res.status(404).json({ error: 'That deck is no longer public.' })
        }
      }
      const count = await withTable(() => sql!`SELECT count(*)::int AS n FROM takaradecks_likes WHERE deck_id = ${id}`)
      return res.status(200).json({ likes: count[0].n as number, liked: body.like !== false })
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // The decks this player liked, with fresh counts. Never cached, because it is different for every player.
    if (one(req.query.me)) {
      res.setHeader('Cache-Control', 'no-store')
      const user = await signedIn(req.headers.authorization)
      if (!user) return res.status(401).json({ error: 'Please sign in again.' })
      const rows = await withTable(() => sql!`
        SELECT l.deck_id, (SELECT count(*)::int FROM takaradecks_likes x WHERE x.deck_id = l.deck_id) AS n
        FROM takaradecks_likes l JOIN takaradecks_decks d ON d.id = l.deck_id
        WHERE l.user_id = ${user.id} AND d.game = ${game} AND d.is_public`)
      return res.status(200).json({ liked: Object.fromEntries(rows.map((r) => [r.deck_id, r.n])) })
    }

    const rows = await withTable(() => sql!`
      SELECT d.id, d.name, COALESCE(u.username, 'Player') AS author, d.cards, d.updated_at,
        (SELECT count(*)::int FROM takaradecks_likes l WHERE l.deck_id = d.id) AS likes
      FROM takaradecks_decks d LEFT JOIN takaradecks_users u ON u.user_id = d.user_id
      WHERE d.is_public AND d.game = ${game} ORDER BY d.updated_at DESC LIMIT ${PAGE}`)
    // Vercel's network answers repeat visits for a minute, so browsing does not wake the database each time.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
    return res.status(200).json({ decks: rows.map((r) => ({ id: r.id, name: r.name, author: r.author || 'Player', cards: r.cards, updatedAt: r.updated_at, likes: r.likes || 0 })) })
  } catch (err) {
    console.error('public decks api failed', err instanceof Error ? err.message : err)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(500).json({ error: req.method === 'POST' ? 'Something went wrong. Please try again.' : 'Public decks could not be loaded. Please try again.' })
  }
}
