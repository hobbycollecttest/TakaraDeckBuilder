import type { VercelRequest, VercelResponse } from '@vercel/node'
import { USERNAME, configured, signedIn, sql, withTable } from '../lib/server.js'

// Sets the signed-in player's username. Their decks pick it up automatically.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured || !sql) return res.status(503).json({ error: 'Accounts are not set up yet.' })
  const user = await signedIn(req.headers.authorization)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const username = typeof (req.body as { username?: unknown } | undefined)?.username === 'string' ? ((req.body as { username: string }).username).trim() : ''
  if (!USERNAME.test(username)) return res.status(400).json({ error: 'Use 3 to 20 letters, numbers, dots, dashes or underscores.' })
  try {
    await withTable(() => sql!`
      INSERT INTO takaradecks_users (user_id, username) VALUES (${user.id}, ${username})
      ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, updated_at = now()`)
    return res.status(200).json({ username })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === '23505' || /duplicate key|unique/i.test(e?.message || '')) return res.status(409).json({ error: 'That username is taken. Try another.' })
    console.error('profile api failed', e?.message)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
