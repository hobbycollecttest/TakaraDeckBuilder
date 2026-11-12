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
const load = (authUrl: string) => import('@neon/neon-js/auth').then((m) => m.createAuthClient(authUrl))
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

async function session(): Promise<SessionData | null> {
  const c = client()
  if (!c) return null
  try {
    const result = (await (await c).getSession()) as { data?: SessionData | null }
    const data = result.data ?? null
    const token = data?.session?.token
    cached = token ? { token, expires: tokenExpiry(token) } : null
    return data
  } catch {
    return null
  }
}

export async function currentAccount(): Promise<Account | null> {
  if (!remembered()) return null
  const user = (await session())?.user
  if (!user) {
    remember(false)
    return null
  }
  return { id: user.id, name: user.name || user.email || 'Player', email: user.email || '' }
}

// Tokens last 15 minutes; one is reused until its last minute instead of asking for a new one per request.
export async function accessToken(): Promise<string | null> {
  if (cached && cached.expires - Date.now() > 60_000) return cached.token
  return (await session())?.session?.token ?? null
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
