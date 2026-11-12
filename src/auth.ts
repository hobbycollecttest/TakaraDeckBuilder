import { createAuthClient } from '@neon/neon-js/auth'

export type Account = { id: string; name: string; email: string }

const url = import.meta.env.VITE_NEON_AUTH_URL as string | undefined
// Without the Auth URL (a local build with no database attached) the site still works, signed out.
export const authReady = Boolean(url)
const client = url ? createAuthClient(url) : null

type SessionResult = { data?: { user?: { id: string; name?: string | null; email?: string | null } | null; session?: { token?: string | null } | null } | null }

async function session(): Promise<SessionResult['data'] | null> {
  if (!client) return null
  try {
    const result = (await client.getSession()) as SessionResult
    return result.data ?? null
  } catch {
    return null
  }
}

export async function currentAccount(): Promise<Account | null> {
  const user = (await session())?.user
  return user ? { id: user.id, name: user.name || user.email || 'Player', email: user.email || '' } : null
}

// The token is short-lived, so it is read fresh for every request.
export async function accessToken(): Promise<string | null> {
  return (await session())?.session?.token ?? null
}

export async function signInWithGoogle() {
  if (!client) return
  await client.signIn.social({ provider: 'google', callbackURL: window.location.origin })
}

export async function signOut() {
  if (client) await client.signOut()
}
