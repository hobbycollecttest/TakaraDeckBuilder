import { accessToken } from './auth'

export type CloudDeck = { id: string; name: string; cards: Record<string, number>; isPublic: boolean; updatedAt: string }
export type PublicDeck = { id: string; name: string; author: string; cards: Record<string, number>; updatedAt: string }

export class ApiError extends Error {
  needsUsername = false
}

async function call<T>(method: string, body?: unknown, query = '', path = '/api/decks'): Promise<T> {
  const token = await accessToken()
  if (!token) throw new Error('Please sign in again')
  const res = await fetch(`${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; needsUsername?: boolean }
  if (!res.ok) {
    const err = new ApiError(data.error || 'Something went wrong. Please try again.')
    err.needsUsername = data.needsUsername === true
    throw err
  }
  return data as T
}

export const listDecks = (game: string) => call<{ decks: CloudDeck[]; username?: string }>('GET', undefined, `?game=${game}`).then((r) => ({ decks: r.decks, username: r.username || '' }))
export const saveUsername = (username: string) => call<{ username: string }>('PUT', { username }, '', '/api/profile').then((r) => r.username)
export const saveDeck = (deck: { game: string; id?: string; name: string; cards: Record<string, number>; isPublic: boolean }) =>
  call<{ deck: CloudDeck }>('PUT', deck).then((r) => r.deck)
export const deleteDeck = (id: string) => call<{ ok: true }>('DELETE', undefined, `?id=${encodeURIComponent(id)}`)

// Anyone can browse public decks, signed in or not.
export async function listPublicDecks(game: string): Promise<PublicDeck[]> {
  const res = await fetch(`/api/public-decks?game=${game}`)
  const data = (await res.json().catch(() => ({}))) as { decks?: PublicDeck[]; error?: string }
  if (!res.ok || !data.decks) throw new Error(data.error || 'Public decks could not be loaded. Please try again.')
  return data.decks
}
