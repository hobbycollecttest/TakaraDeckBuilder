import type { VercelRequest, VercelResponse } from '@vercel/node'

// Sign-in goes through this site instead of straight to Neon Auth, so the session cookie belongs to
// takaradecks itself. Browsers that block other sites' cookies (Safari, every iPhone browser, private
// windows) used to drop the Neon cookie, which signed people out as soon as the page reloaded.
const base = (process.env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '')
const PASS_REQUEST = ['user-agent', 'authorization', 'content-type', 'x-neon-client-info']
const PASS_RESPONSE = ['content-type', 'set-auth-jwt', 'set-auth-token', 'x-neon-ret-request-id']
const COOKIE_PREFIX = '__Secure-neon-auth'

const authCookies = (header: string | undefined) =>
  (header || '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(COOKIE_PREFIX))
    .join('; ')

// Neon marks its cookies for cross-site use; here they are first-party, so they become ordinary ones.
const firstParty = (cookie: string) => {
  const [pair, ...attrs] = cookie.split(';').map((p) => p.trim())
  const kept = attrs.filter((a) => !/^(partitioned|secure|domain=|samesite=|path=)/i.test(a))
  return [pair, ...kept, 'Path=/', 'Secure', 'SameSite=Lax'].join('; ')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!base) return res.status(503).json({ error: 'Accounts are not set up yet.' })
  const raw = req.query.path
  const path = (Array.isArray(raw) ? raw.join('/') : raw || '').replace(/^\/+|\/+$/g, '')
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(path)) return res.status(404).json({ error: 'Not found' })

  const upstream = new URL(`${base}/${path}`)
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue
    for (const v of Array.isArray(value) ? value : [value]) if (typeof v === 'string') upstream.searchParams.append(key, v)
  }

  const site = `https://${req.headers.host}`
  const headers: Record<string, string> = { Origin: site, 'x-neon-auth-middleware': 'true' }
  for (const name of PASS_REQUEST) {
    const value = req.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  const cookies = authCookies(req.headers.cookie)
  if (cookies) headers.Cookie = cookies

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = !hasBody || req.body == null ? undefined : typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body)
  if (body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json'

  try {
    const response = await fetch(upstream, { method: req.method, headers, body, redirect: 'manual' })
    for (const name of PASS_RESPONSE) {
      const value = response.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    const location = response.headers.get('location')
    if (location) res.setHeader('Location', location)
    const set = response.headers.getSetCookie()
    if (set.length) res.setHeader('Set-Cookie', set.map(firstParty))
    return res.status(response.status).send(Buffer.from(await response.arrayBuffer()))
  } catch (err) {
    console.error('auth proxy failed', (err as Error)?.message)
    return res.status(502).json({ error: 'Sign-in is not reachable right now. Please try again.' })
  }
}
