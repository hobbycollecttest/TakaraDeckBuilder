import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql, withTable } from '../lib/server.js'

const PAGE = 60

// Open to everyone, so it never returns who owns a deck beyond the display name they published under.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!sql) return res.status(503).json({ error: 'Public decks are not set up yet.' })
  try {
    const rows = await withTable(() => sql!`SELECT id, name, author, cards, updated_at FROM takaradecks_decks WHERE is_public AND game = 'horobeat' ORDER BY updated_at DESC LIMIT ${PAGE}`)
    // Vercel's network answers repeat visits for a minute, so browsing does not wake the database each time.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')
    return res.status(200).json({ decks: rows.map((r) => ({ id: r.id, name: r.name, author: r.author || 'Player', cards: r.cards, updatedAt: r.updated_at })) })
  } catch (err) {
    console.error('public decks api failed', err instanceof Error ? err.message : err)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(500).json({ error: 'Public decks could not be loaded. Please try again.' })
  }
}
