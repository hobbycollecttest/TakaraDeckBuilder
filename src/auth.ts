export type Account = { id: string; name: string; email: string }

const url = import.meta.env.VITE_NEON_AUTH_URL as string | undefined
// Without the Auth URL (a local build with no database attached) the site still works, signed out.
export const authReady = Boolean(url)

type SessionData = { user?: { id: string; name?: string | null; email?: string | null } | null; session?: { token?: string | null } | null }

// Checking a session wakes the database, so it only happens for browsers that have signed in here before.
const FLAG = 'td.signedIn'
const remembered = () => {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}
const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(FLAG, '1')
    else localStorage.removeItem(FLAG)
  } catch {
    /* private mode */
  }
}

// The sign-in library is large; visitors who never sign in never download it.
// It talks to this site's own /api/auth, which passes requests on to Neon Auth. That keeps the session
// cookie on this site, so browsers that block other sites' cookies (Safari, iPhones) stay signed in.
const load = (_authUrl: string) => import('@neon/neon-js/auth').then((m) => m.createAuthClient(`${window.location.origin}/api/auth`))
let loading: ReturnType<typeof load> | null = null
function client() {
  if (!url) return null
  loading ??= load(url)
  return loading
}

let cached: { token: string; expires: number } | null = null
function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

// "unknown" means the check itself failed (offline, a slow start); that must not sign anyone out.
async function session(): Promise<SessionData | null | 'unknown'> {
  const c = client()
  if (!c) return null
  try {
    const result = (await (await c).getSession()) as { data?: SessionData | null; error?: unknown }
    if (result.error) return 'unknown'
    const data = result.data ?? null
    const token = data?.session?.token
    cached = token ? { token, expires: tokenExpiry(token) } : null
    return data
  } catch {
    return 'unknown'
  }
}

export async function currentAccount(): Promise<Account | null> {
  if (!remembered()) return null
  let found = await session()
  if (found === 'unknown') found = await session()
  if (found === 'unknown') return null
  const user = found?.user
  if (!user) {
    remember(false)
    return null
  }
  return { id: user.id, name: user.name || user.email || 'Player', email: user.email || '' }
}

// Tokens last 15 minutes; one is reused until its last minute instead of asking for a new one per request.
export async function accessToken(): Promise<string | null> {
  if (cached && cached.expires - Date.now() > 60_000) return cached.token
  const found = await session()
  return found === 'unknown' ? null : (found?.session?.token ?? null)
}

export async function signInWithGoogle() {
  const c = client()
  if (!c) return
  remember(true)
  await (await c).signIn.social({ provider: 'google', callbackURL: window.location.origin })
}

export async function signOut() {
  remember(false)
  cached = null
  const c = client()
  if (c) await (await c).signOut()
}
